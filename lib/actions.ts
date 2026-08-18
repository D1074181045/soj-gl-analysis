"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "./db";
import { createSession, destroySession, getCurrentUser } from "./auth";
import { decodeCsv, parseGuildWarCsv } from "./parse";
import { MAIN_TEAMS, SUB_ROLES } from "./types";
import type { MainTeam, SubRole } from "./types";

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
  await createSession(Number(info.lastInsertRowid));
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

// 設定分團：主團必選（進攻/機動/防守三選一）、副職可為空（保鑣/扛拆/空拆三選一）
export async function setTeamAssignmentAction(
  playerName: string,
  mainTeam: string,
  subRole: string | null
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = playerName.trim();
  if (!name) return { error: "玩家名字不可為空" };
  if (!MAIN_TEAMS.includes(mainTeam as MainTeam)) {
    return { error: "主團必須為進攻、機動或防守其中之一" };
  }
  if (subRole !== null && !SUB_ROLES.includes(subRole as SubRole)) {
    return { error: "副職必須為保鑣、扛拆或空拆其中之一" };
  }
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
