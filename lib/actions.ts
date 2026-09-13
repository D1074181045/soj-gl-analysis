"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db, { seedDefaultSubRoles, seedDefaultTeams } from "./db";
import { createSession, destroySession, getCurrentUser } from "./auth";
import { decodeCsv, parseGuildWarCsv } from "./parse";
import { getUserSubRoles, getUserTeams } from "./data";
import { UNASSIGNED_LABEL } from "./types";
import type { UserSubRole, UserTeam } from "./types";

export interface ActionState {
  error?: string;
}

export async function registerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (username.length < 3 || username.length > 20) {
    return { error: "帳號長度需為 3–20 字元" };
  }
  if (password.length < 6) {
    return { error: "密碼至少需要 6 個字元" };
  }
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return { error: "此帳號已被註冊" };
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hash);
  const userId = Number(info.lastInsertRowid);
  seedDefaultTeams(userId);
  seedDefaultSubRoles(userId);
  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const row = db
    .prepare("SELECT id, password_hash AS hash FROM users WHERE username = ?")
    .get(username) as { id: number; hash: string } | undefined;
  if (!row || !bcrypt.compareSync(password, row.hash)) {
    return { error: "帳號或密碼錯誤" };
  }
  await createSession(row.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function uploadMatchAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "請選擇要上傳的 CSV 檔案" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "檔案過大（上限 5MB）" };
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseGuildWarCsv(decodeCsv(buf));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "CSV 解析失敗" };
  }

  const customTitle = String(formData.get("title") ?? "").trim();
  const title =
    customTitle || `${parsed.ally.guildName} vs ${parsed.enemy.guildName}`;

  const insertMatch = db.prepare(
    `INSERT INTO matches (user_id, title, ally_name, ally_count, enemy_name, enemy_count)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertPlayer = db.prepare(
    `INSERT INTO players (match_id, side, name, cls, kills, assists, resources,
       player_damage, building_damage, healing, damage_taken, deaths, purify, burn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const matchId = db.transaction(() => {
    const info = insertMatch.run(
      user.id,
      title,
      parsed.ally.guildName,
      parsed.ally.memberCount,
      parsed.enemy.guildName,
      parsed.enemy.memberCount
    );
    const id = Number(info.lastInsertRowid);
    for (const [side, section] of [parsed.ally, parsed.enemy].entries()) {
      for (const p of section.players) {
        insertPlayer.run(
          id, side, p.name, p.cls, p.kills, p.assists, p.resources,
          p.playerDamage, p.buildingDamage, p.healing, p.damageTaken,
          p.deaths, p.purify, p.burn
        );
      }
    }
    return id;
  })();

  revalidatePath("/dashboard");
  redirect(`/match/${matchId}`);
}

function requireOwnedMatch(userId: number, matchId: number) {
  const row = db
    .prepare("SELECT id FROM matches WHERE id = ? AND user_id = ?")
    .get(matchId, userId);
  if (!row) throw new Error("找不到場次或無權限");
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  requireOwnedMatch(user.id, id);
  db.prepare("DELETE FROM matches WHERE id = ?").run(id);
  revalidatePath("/dashboard");
}

export async function enableShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  requireOwnedMatch(user.id, id);
  const token = crypto.randomBytes(9).toString("base64url");
  db.prepare("UPDATE matches SET share_token = ? WHERE id = ?").run(token, id);
  revalidatePath("/dashboard");
  revalidatePath(`/match/${id}`);
}

export async function disableShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  requireOwnedMatch(user.id, id);
  db.prepare("UPDATE matches SET share_token = NULL WHERE id = ?").run(id);
  revalidatePath("/dashboard");
  revalidatePath(`/match/${id}`);
}

// 驗證主團/副職；兩者都必須是該使用者自訂清單中的名稱（副職可為 null）
function validateTeamChoice(
  userId: number,
  mainTeam: string,
  subRole: string | null
): string | null {
  const names = getUserTeams(userId).map((t) => t.name);
  if (!names.includes(mainTeam)) {
    return "主團必須是陣容配置中已建立的分團";
  }
  if (subRole !== null) {
    const subNames = getUserSubRoles(userId).map((s) => s.name);
    if (!subNames.includes(subRole)) {
      return "副職必須是陣容配置中已建立的副職";
    }
  }
  return null;
}

// 設定分團：主團必選（使用者自訂清單中擇一）、副職可為空（使用者自訂清單中擇一）
export async function setTeamAssignmentAction(
  playerName: string,
  mainTeam: string,
  subRole: string | null
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = playerName.trim();
  if (!name) return { error: "玩家名字不可為空" };
  const err = validateTeamChoice(user.id, mainTeam, subRole);
  if (err) return { error: err };
  db.prepare(
    `INSERT INTO team_assignments (user_id, player_name, main_team, sub_role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, player_name)
     DO UPDATE SET main_team = excluded.main_team, sub_role = excluded.sub_role`
  ).run(user.id, name, mainTeam, subRole);
  revalidatePath("/teams");
  return {};
}

export async function clearTeamAssignmentAction(
  playerName: string
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  db.prepare(
    "DELETE FROM team_assignments WHERE user_id = ? AND player_name = ?"
  ).run(user.id, playerName.trim());
  revalidatePath("/teams");
}

// 單場分團調整（覆蓋統一陣容配置；規則與統一配置相同）
export async function setMatchTeamAssignmentAction(
  matchId: number,
  playerName: string,
  mainTeam: string,
  subRole: string | null
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireOwnedMatch(user.id, matchId);
  const name = playerName.trim();
  if (!name) return { error: "玩家名字不可為空" };
  const err = validateTeamChoice(user.id, mainTeam, subRole);
  if (err) return { error: err };
  db.prepare(
    `INSERT INTO match_team_assignments (match_id, player_name, main_team, sub_role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(match_id, player_name)
     DO UPDATE SET main_team = excluded.main_team, sub_role = excluded.sub_role`
  ).run(matchId, name, mainTeam, subRole);
  revalidatePath(`/match/${matchId}`);
  return {};
}

// 還原單場調整（回到統一陣容配置）
export async function clearMatchTeamAssignmentAction(
  matchId: number,
  playerName: string
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  requireOwnedMatch(user.id, matchId);
  db.prepare(
    "DELETE FROM match_team_assignments WHERE match_id = ? AND player_name = ?"
  ).run(matchId, playerName.trim());
  revalidatePath(`/match/${matchId}`);
}

// ===== 主團管理（使用者自訂清單）=====

export interface TeamListResult {
  error?: string;
  teams?: UserTeam[];
}

function validateTeamName(name: string, userId: number, excludeId?: number): string | null {
  if (!name) return "分團名稱不可為空";
  if (name.length > 12) return "分團名稱最多 12 個字";
  if (name === UNASSIGNED_LABEL) return `「${UNASSIGNED_LABEL}」為保留名稱`;
  const dup = db
    .prepare("SELECT id FROM user_teams WHERE user_id = ? AND name = ?")
    .get(userId, name) as { id: number } | undefined;
  if (dup && dup.id !== excludeId) return "已有同名分團";
  return null;
}

export async function addTeamAction(rawName: string): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = rawName.trim();
  const err = validateTeamName(name, user.id);
  if (err) return { error: err };
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM user_teams WHERE user_id = ?").get(user.id) as {
      c: number;
    }
  ).c;
  if (count >= 20) return { error: "分團數量上限為 20 個" };
  db.prepare(
    `INSERT INTO user_teams (user_id, name, sort_order)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM user_teams WHERE user_id = ?))`
  ).run(user.id, name, user.id);
  revalidatePath("/teams");
  return { teams: getUserTeams(user.id) };
}

export async function renameTeamAction(
  teamId: number,
  rawName: string
): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = db
    .prepare("SELECT name FROM user_teams WHERE id = ? AND user_id = ?")
    .get(teamId, user.id) as { name: string } | undefined;
  if (!row) return { error: "找不到分團" };
  const name = rawName.trim();
  if (name === row.name) return { teams: getUserTeams(user.id) };
  const err = validateTeamName(name, user.id, teamId);
  if (err) return { error: err };
  // 同步更新統一配置與所有本場調整中的主團名稱
  db.transaction(() => {
    db.prepare("UPDATE user_teams SET name = ? WHERE id = ?").run(name, teamId);
    db.prepare(
      "UPDATE team_assignments SET main_team = ? WHERE user_id = ? AND main_team = ?"
    ).run(name, user.id, row.name);
    db.prepare(
      `UPDATE match_team_assignments SET main_team = ?
       WHERE main_team = ? AND match_id IN (SELECT id FROM matches WHERE user_id = ?)`
    ).run(name, row.name, user.id);
  })();
  revalidatePath("/teams");
  return { teams: getUserTeams(user.id) };
}

// 刪除分團會一併清除該團的統一配置與本場調整
export async function deleteTeamAction(teamId: number): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = db
    .prepare("SELECT name FROM user_teams WHERE id = ? AND user_id = ?")
    .get(teamId, user.id) as { name: string } | undefined;
  if (!row) return { error: "找不到分團" };
  db.transaction(() => {
    db.prepare("DELETE FROM user_teams WHERE id = ?").run(teamId);
    db.prepare("DELETE FROM team_assignments WHERE user_id = ? AND main_team = ?").run(
      user.id,
      row.name
    );
    db.prepare(
      `DELETE FROM match_team_assignments
       WHERE main_team = ? AND match_id IN (SELECT id FROM matches WHERE user_id = ?)`
    ).run(row.name, user.id);
  })();
  revalidatePath("/teams");
  return { teams: getUserTeams(user.id) };
}

// ===== 副職管理（使用者自訂清單；與主團管理對稱）=====

export interface SubRoleListResult {
  error?: string;
  subRoles?: UserSubRole[];
}

function validateSubRoleName(
  name: string,
  userId: number,
  excludeId?: number
): string | null {
  if (!name) return "副職名稱不可為空";
  if (name.length > 12) return "副職名稱最多 12 個字";
  const dup = db
    .prepare("SELECT id FROM user_sub_roles WHERE user_id = ? AND name = ?")
    .get(userId, name) as { id: number } | undefined;
  if (dup && dup.id !== excludeId) return "已有同名副職";
  return null;
}

export async function addSubRoleAction(rawName: string): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = rawName.trim();
  const err = validateSubRoleName(name, user.id);
  if (err) return { error: err };
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM user_sub_roles WHERE user_id = ?").get(user.id) as {
      c: number;
    }
  ).c;
  if (count >= 20) return { error: "副職數量上限為 20 個" };
  db.prepare(
    `INSERT INTO user_sub_roles (user_id, name, sort_order)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM user_sub_roles WHERE user_id = ?))`
  ).run(user.id, name, user.id);
  revalidatePath("/teams");
  return { subRoles: getUserSubRoles(user.id) };
}

export async function renameSubRoleAction(
  subRoleId: number,
  rawName: string
): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = db
    .prepare("SELECT name FROM user_sub_roles WHERE id = ? AND user_id = ?")
    .get(subRoleId, user.id) as { name: string } | undefined;
  if (!row) return { error: "找不到副職" };
  const name = rawName.trim();
  if (name === row.name) return { subRoles: getUserSubRoles(user.id) };
  const err = validateSubRoleName(name, user.id, subRoleId);
  if (err) return { error: err };
  // 同步更新統一配置與所有本場調整中的副職名稱
  db.transaction(() => {
    db.prepare("UPDATE user_sub_roles SET name = ? WHERE id = ?").run(name, subRoleId);
    db.prepare(
      "UPDATE team_assignments SET sub_role = ? WHERE user_id = ? AND sub_role = ?"
    ).run(name, user.id, row.name);
    db.prepare(
      `UPDATE match_team_assignments SET sub_role = ?
       WHERE sub_role = ? AND match_id IN (SELECT id FROM matches WHERE user_id = ?)`
    ).run(name, row.name, user.id);
  })();
  revalidatePath("/teams");
  return { subRoles: getUserSubRoles(user.id) };
}

// 刪除副職：副職為選填，只把引用它的設定改回「無副職」，不移除玩家的主團
export async function deleteSubRoleAction(subRoleId: number): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = db
    .prepare("SELECT name FROM user_sub_roles WHERE id = ? AND user_id = ?")
    .get(subRoleId, user.id) as { name: string } | undefined;
  if (!row) return { error: "找不到副職" };
  db.transaction(() => {
    db.prepare("DELETE FROM user_sub_roles WHERE id = ?").run(subRoleId);
    db.prepare(
      "UPDATE team_assignments SET sub_role = NULL WHERE user_id = ? AND sub_role = ?"
    ).run(user.id, row.name);
    db.prepare(
      `UPDATE match_team_assignments SET sub_role = NULL
       WHERE sub_role = ? AND match_id IN (SELECT id FROM matches WHERE user_id = ?)`
    ).run(row.name, user.id);
  })();
  revalidatePath("/teams");
  return { subRoles: getUserSubRoles(user.id) };
}
