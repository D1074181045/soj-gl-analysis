"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpressionBuilder } from "kysely";
import db, {
  DIALECT,
  insertReturningId,
  ready,
  seedDefaultSubRoles,
  seedDefaultTeams,
} from "./db";
import type { Database } from "./db";
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
  await ready();
  const exists = await db
    .selectFrom("users")
    .select("id")
    .where("username", "=", username)
    .executeTakeFirst();
  if (exists) return { error: "此帳號已被註冊" };
  const hash = bcrypt.hashSync(password, 10);
  const userId = await insertReturningId("users", { username, password_hash: hash });
  await seedDefaultTeams(userId);
  await seedDefaultSubRoles(userId);
  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  await ready();
  const row = await db
    .selectFrom("users")
    .select(["id", "password_hash as hash"])
    .where("username", "=", username)
    .executeTakeFirst();
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

  await ready();
  const matchId = await db.transaction().execute(async (trx) => {
    // 取得自增 id：Postgres 用 RETURNING，其餘用 insertId
    const insert = trx.insertInto("matches").values({
      user_id: user.id,
      title,
      ally_name: parsed.ally.guildName,
      ally_count: parsed.ally.memberCount,
      enemy_name: parsed.enemy.guildName,
      enemy_count: parsed.enemy.memberCount,
    });
    let id: number;
    if (DIALECT === "postgres") {
      const row = await insert.returning("id").executeTakeFirstOrThrow();
      id = Number(row.id);
    } else {
      const res = await insert.executeTakeFirstOrThrow();
      id = Number(res.insertId);
    }

    const rows = [parsed.ally, parsed.enemy].flatMap((section, side) =>
      section.players.map((p) => ({
        match_id: id,
        side,
        name: p.name,
        cls: p.cls,
        kills: p.kills,
        assists: p.assists,
        resources: p.resources,
        player_damage: p.playerDamage,
        building_damage: p.buildingDamage,
        healing: p.healing,
        damage_taken: p.damageTaken,
        deaths: p.deaths,
        purify: p.purify,
        burn: p.burn,
      }))
    );
    // 分批插入，避免單一語句參數過多
    for (let i = 0; i < rows.length; i += 50) {
      await trx.insertInto("players").values(rows.slice(i, i + 50)).execute();
    }
    return id;
  });

  revalidatePath("/dashboard");
  redirect(`/match/${matchId}`);
}

async function requireOwnedMatch(userId: number, matchId: number): Promise<void> {
  const row = await db
    .selectFrom("matches")
    .select("id")
    .where("id", "=", matchId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!row) throw new Error("找不到場次或無權限");
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  await requireOwnedMatch(user.id, id);
  await db.deleteFrom("matches").where("id", "=", id).execute();
  revalidatePath("/dashboard");
}

export async function enableShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  await requireOwnedMatch(user.id, id);
  const token = crypto.randomBytes(9).toString("base64url");
  await db.updateTable("matches").set({ share_token: token }).where("id", "=", id).execute();
  revalidatePath("/dashboard");
  revalidatePath(`/match/${id}`);
}

export async function disableShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number(formData.get("id"));
  await requireOwnedMatch(user.id, id);
  await db.updateTable("matches").set({ share_token: null }).where("id", "=", id).execute();
  revalidatePath("/dashboard");
  revalidatePath(`/match/${id}`);
}

// 驗證主團/副職；兩者都必須是該使用者自訂清單中的名稱（副職可為 null）
async function validateTeamChoice(
  userId: number,
  mainTeam: string,
  subRole: string | null
): Promise<string | null> {
  const names = (await getUserTeams(userId)).map((t) => t.name);
  if (!names.includes(mainTeam)) {
    return "主團必須是陣容配置中已建立的分團";
  }
  if (subRole !== null) {
    const subNames = (await getUserSubRoles(userId)).map((s) => s.name);
    if (!subNames.includes(subRole)) {
      return "副職必須是陣容配置中已建立的副職";
    }
  }
  return null;
}

// UPSERT（三方言）：MySQL 用 ON DUPLICATE KEY UPDATE，其餘用 ON CONFLICT DO UPDATE
async function upsertTeamAssignment(
  userId: number,
  playerName: string,
  mainTeam: string,
  subRole: string | null
): Promise<void> {
  const update = { main_team: mainTeam, sub_role: subRole };
  const q = db
    .insertInto("team_assignments")
    .values({ user_id: userId, player_name: playerName, ...update });
  if (DIALECT === "mysql") await q.onDuplicateKeyUpdate(update).execute();
  else
    await q
      .onConflict((oc) => oc.columns(["user_id", "player_name"]).doUpdateSet(update))
      .execute();
}

async function upsertMatchTeamAssignment(
  matchId: number,
  playerName: string,
  mainTeam: string,
  subRole: string | null
): Promise<void> {
  const update = { main_team: mainTeam, sub_role: subRole };
  const q = db
    .insertInto("match_team_assignments")
    .values({ match_id: matchId, player_name: playerName, ...update });
  if (DIALECT === "mysql") await q.onDuplicateKeyUpdate(update).execute();
  else
    await q
      .onConflict((oc) => oc.columns(["match_id", "player_name"]).doUpdateSet(update))
      .execute();
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
  const err = await validateTeamChoice(user.id, mainTeam, subRole);
  if (err) return { error: err };
  await upsertTeamAssignment(user.id, name, mainTeam, subRole);
  revalidatePath("/teams");
  return {};
}

export async function clearTeamAssignmentAction(playerName: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await db
    .deleteFrom("team_assignments")
    .where("user_id", "=", user.id)
    .where("player_name", "=", playerName.trim())
    .execute();
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
  await requireOwnedMatch(user.id, matchId);
  const name = playerName.trim();
  if (!name) return { error: "玩家名字不可為空" };
  const err = await validateTeamChoice(user.id, mainTeam, subRole);
  if (err) return { error: err };
  await upsertMatchTeamAssignment(matchId, name, mainTeam, subRole);
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
  await requireOwnedMatch(user.id, matchId);
  await db
    .deleteFrom("match_team_assignments")
    .where("match_id", "=", matchId)
    .where("player_name", "=", playerName.trim())
    .execute();
  revalidatePath(`/match/${matchId}`);
}

// ===== 主團管理（使用者自訂清單）=====

export interface TeamListResult {
  error?: string;
  teams?: UserTeam[];
}

async function validateTeamName(
  name: string,
  userId: number,
  excludeId?: number
): Promise<string | null> {
  if (!name) return "分團名稱不可為空";
  if (name.length > 12) return "分團名稱最多 12 個字";
  if (name === UNASSIGNED_LABEL) return `「${UNASSIGNED_LABEL}」為保留名稱`;
  const dup = await db
    .selectFrom("user_teams")
    .select("id")
    .where("user_id", "=", userId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (dup && dup.id !== excludeId) return "已有同名分團";
  return null;
}

// 下一個排序值與目前數量（新增前用）
async function nextSortOrder(table: "user_teams" | "user_sub_roles", userId: number) {
  const row = await db
    .selectFrom(table)
    .select((eb) => [eb.fn.max("sort_order").as("m"), eb.fn.countAll().as("c")])
    .where("user_id", "=", userId)
    .executeTakeFirstOrThrow();
  return { next: Number(row.m ?? -1) + 1, count: Number(row.c) };
}

// 子查詢：該使用者擁有的所有場次 id（供 match_team_assignments 的批次更新/刪除）
const ownedMatchIds =
  (userId: number) => (eb: ExpressionBuilder<Database, "match_team_assignments">) =>
    eb.selectFrom("matches").select("matches.id").where("matches.user_id", "=", userId);

export async function addTeamAction(rawName: string): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = rawName.trim();
  const err = await validateTeamName(name, user.id);
  if (err) return { error: err };
  const { next, count } = await nextSortOrder("user_teams", user.id);
  if (count >= 20) return { error: "分團數量上限為 20 個" };
  await db
    .insertInto("user_teams")
    .values({ user_id: user.id, name, sort_order: next })
    .execute();
  revalidatePath("/teams");
  return { teams: await getUserTeams(user.id) };
}

export async function renameTeamAction(
  teamId: number,
  rawName: string
): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = await db
    .selectFrom("user_teams")
    .select("name")
    .where("id", "=", teamId)
    .where("user_id", "=", user.id)
    .executeTakeFirst();
  if (!row) return { error: "找不到分團" };
  const name = rawName.trim();
  if (name === row.name) return { teams: await getUserTeams(user.id) };
  const err = await validateTeamName(name, user.id, teamId);
  if (err) return { error: err };
  // 同步更新統一配置與所有本場調整中的主團名稱
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("user_teams").set({ name }).where("id", "=", teamId).execute();
    await trx
      .updateTable("team_assignments")
      .set({ main_team: name })
      .where("user_id", "=", user.id)
      .where("main_team", "=", row.name)
      .execute();
    await trx
      .updateTable("match_team_assignments")
      .set({ main_team: name })
      .where("main_team", "=", row.name)
      .where("match_id", "in", ownedMatchIds(user.id))
      .execute();
  });
  revalidatePath("/teams");
  return { teams: await getUserTeams(user.id) };
}

// 刪除分團會一併清除該團的統一配置與本場調整
export async function deleteTeamAction(teamId: number): Promise<TeamListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = await db
    .selectFrom("user_teams")
    .select("name")
    .where("id", "=", teamId)
    .where("user_id", "=", user.id)
    .executeTakeFirst();
  if (!row) return { error: "找不到分團" };
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("user_teams").where("id", "=", teamId).execute();
    await trx
      .deleteFrom("team_assignments")
      .where("user_id", "=", user.id)
      .where("main_team", "=", row.name)
      .execute();
    await trx
      .deleteFrom("match_team_assignments")
      .where("main_team", "=", row.name)
      .where("match_id", "in", ownedMatchIds(user.id))
      .execute();
  });
  revalidatePath("/teams");
  return { teams: await getUserTeams(user.id) };
}

// ===== 副職管理（使用者自訂清單；與主團管理對稱）=====

export interface SubRoleListResult {
  error?: string;
  subRoles?: UserSubRole[];
}

async function validateSubRoleName(
  name: string,
  userId: number,
  excludeId?: number
): Promise<string | null> {
  if (!name) return "副職名稱不可為空";
  if (name.length > 12) return "副職名稱最多 12 個字";
  const dup = await db
    .selectFrom("user_sub_roles")
    .select("id")
    .where("user_id", "=", userId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (dup && dup.id !== excludeId) return "已有同名副職";
  return null;
}

export async function addSubRoleAction(rawName: string): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = rawName.trim();
  const err = await validateSubRoleName(name, user.id);
  if (err) return { error: err };
  const { next, count } = await nextSortOrder("user_sub_roles", user.id);
  if (count >= 20) return { error: "副職數量上限為 20 個" };
  await db
    .insertInto("user_sub_roles")
    .values({ user_id: user.id, name, sort_order: next })
    .execute();
  revalidatePath("/teams");
  return { subRoles: await getUserSubRoles(user.id) };
}

export async function renameSubRoleAction(
  subRoleId: number,
  rawName: string
): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = await db
    .selectFrom("user_sub_roles")
    .select("name")
    .where("id", "=", subRoleId)
    .where("user_id", "=", user.id)
    .executeTakeFirst();
  if (!row) return { error: "找不到副職" };
  const name = rawName.trim();
  if (name === row.name) return { subRoles: await getUserSubRoles(user.id) };
  const err = await validateSubRoleName(name, user.id, subRoleId);
  if (err) return { error: err };
  // 同步更新統一配置與所有本場調整中的副職名稱
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("user_sub_roles").set({ name }).where("id", "=", subRoleId).execute();
    await trx
      .updateTable("team_assignments")
      .set({ sub_role: name })
      .where("user_id", "=", user.id)
      .where("sub_role", "=", row.name)
      .execute();
    await trx
      .updateTable("match_team_assignments")
      .set({ sub_role: name })
      .where("sub_role", "=", row.name)
      .where("match_id", "in", ownedMatchIds(user.id))
      .execute();
  });
  revalidatePath("/teams");
  return { subRoles: await getUserSubRoles(user.id) };
}

// 刪除副職：副職為選填，只把引用它的設定改回「無副職」，不移除玩家的主團
export async function deleteSubRoleAction(subRoleId: number): Promise<SubRoleListResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = await db
    .selectFrom("user_sub_roles")
    .select("name")
    .where("id", "=", subRoleId)
    .where("user_id", "=", user.id)
    .executeTakeFirst();
  if (!row) return { error: "找不到副職" };
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("user_sub_roles").where("id", "=", subRoleId).execute();
    await trx
      .updateTable("team_assignments")
      .set({ sub_role: null })
      .where("user_id", "=", user.id)
      .where("sub_role", "=", row.name)
      .execute();
    await trx
      .updateTable("match_team_assignments")
      .set({ sub_role: null })
      .where("sub_role", "=", row.name)
      .where("match_id", "in", ownedMatchIds(user.id))
      .execute();
  });
  revalidatePath("/teams");
  return { subRoles: await getUserSubRoles(user.id) };
}
