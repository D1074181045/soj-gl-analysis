import db, { ready, toIso } from "./db";
import type {
  MatchDetail,
  MatchSummary,
  PlayerStats,
  RosterEntry,
  TeamMap,
  UserSubRole,
  UserTeam,
} from "./types";

interface PlayerRow {
  id: number;
  side: number;
  name: string;
  cls: string;
  kills: number;
  assists: number;
  resources: number;
  player_damage: number | string;
  building_damage: number | string;
  healing: number | string;
  damage_taken: number | string;
  deaths: number;
  purify: number;
  burn: number;
}

interface MatchRow {
  id: number;
  public_id: string;
  title: string;
  ally_name: string;
  ally_count: number;
  enemy_name: string;
  enemy_count: number;
  share_token: string | null;
  created_at: Date | string;
}

// bigint 欄位在 pg/mysql 可能回傳字串，統一轉數字
const n = (v: number | string) => Number(v);

function toPlayer(r: PlayerRow): PlayerStats {
  return {
    id: r.id,
    name: r.name,
    cls: r.cls,
    kills: r.kills,
    assists: r.assists,
    resources: r.resources,
    playerDamage: n(r.player_damage),
    buildingDamage: n(r.building_damage),
    healing: n(r.healing),
    damageTaken: n(r.damage_taken),
    deaths: r.deaths,
    purify: r.purify,
    burn: r.burn,
  };
}

function toSummary(r: MatchRow): MatchSummary {
  return {
    id: r.public_id, // 只對外暴露隨機 id
    title: r.title,
    allyName: r.ally_name,
    allyCount: r.ally_count,
    enemyName: r.enemy_name,
    enemyCount: r.enemy_count,
    shareToken: r.share_token,
    createdAt: toIso(r.created_at),
  };
}

export async function getUserMatches(userId: number): Promise<MatchSummary[]> {
  await ready();
  const rows = await db
    .selectFrom("matches")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  return rows.map(toSummary);
}

async function attachPlayers(match: MatchRow): Promise<MatchDetail> {
  const players = await db
    .selectFrom("players")
    .selectAll()
    .where("match_id", "=", match.id)
    .orderBy("id")
    .execute();
  return {
    ...toSummary(match),
    ally: players.filter((p) => p.side === 0).map(toPlayer),
    enemy: players.filter((p) => p.side === 1).map(toPlayer),
  };
}

export async function getMatchForUser(
  publicId: string,
  userId: number
): Promise<MatchDetail | null> {
  await ready();
  const row = await db
    .selectFrom("matches")
    .selectAll()
    .where("public_id", "=", publicId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return row ? attachPlayers(row) : null;
}

export async function getMatchByShareToken(token: string): Promise<MatchDetail | null> {
  await ready();
  const row = await db
    .selectFrom("matches")
    .selectAll()
    .where("share_token", "=", token)
    .executeTakeFirst();
  return row ? attachPlayers(row) : null;
}

export interface PlayerHistoryEntry {
  matchId: string; // public id
  matchTitle: string;
  createdAt: string;
  side: number;
  guildName: string;
  opponentName: string;
  stats: PlayerStats;
}

// 該使用者所有場次中出現過的玩家（供跨場比較選擇）
export async function getPlayerHistoryIndex(userId: number): Promise<PlayerHistoryEntry[]> {
  await ready();
  const rows = await db
    .selectFrom("players as p")
    .innerJoin("matches as m", "m.id", "p.match_id")
    .selectAll("p")
    .select([
      "m.public_id as match_public_id",
      "m.title",
      "m.created_at",
      "m.ally_name",
      "m.enemy_name",
    ])
    .where("m.user_id", "=", userId)
    .orderBy("m.created_at", "asc")
    .orderBy("m.id", "asc")
    .orderBy("p.id", "asc")
    .execute();
  return rows.map((r) => ({
    matchId: r.match_public_id,
    matchTitle: r.title,
    createdAt: toIso(r.created_at),
    side: r.side,
    guildName: r.side === 0 ? r.ally_name : r.enemy_name,
    opponentName: r.side === 0 ? r.enemy_name : r.ally_name,
    stats: toPlayer(r),
  }));
}

// 我方名單：該使用者所有場次中 side=0 的不重複玩家（職業取最近一場）
export async function getAllyRoster(userId: number): Promise<RosterEntry[]> {
  await ready();
  const rows = await db
    .selectFrom("players as p")
    .innerJoin("matches as m", "m.id", "p.match_id")
    .select(["p.name", "p.cls"])
    .where("m.user_id", "=", userId)
    .where("p.side", "=", 0)
    .orderBy("m.created_at", "asc")
    .orderBy("m.id", "asc")
    .execute();
  const map = new Map<string, RosterEntry>();
  for (const r of rows) {
    const existing = map.get(r.name);
    map.set(r.name, {
      name: r.name,
      cls: r.cls, // 依時間排序，越後面覆蓋＝最近一場的職業
      matchCount: (existing?.matchCount ?? 0) + 1,
    });
  }
  return [...map.values()];
}

export async function getTeamAssignments(userId: number): Promise<TeamMap> {
  await ready();
  const rows = await db
    .selectFrom("team_assignments")
    .select(["player_name", "main_team", "sub_role"])
    .where("user_id", "=", userId)
    .execute();
  const map: TeamMap = {};
  for (const r of rows) {
    map[r.player_name] = { mainTeam: r.main_team, subRole: r.sub_role };
  }
  return map;
}

// 由 public id 反查場次的內部 id 與擁有者（找不到回 null）
async function resolveMatch(
  publicId: string
): Promise<{ id: number; userId: number } | null> {
  const row = await db
    .selectFrom("matches")
    .select(["id", "user_id"])
    .where("public_id", "=", publicId)
    .executeTakeFirst();
  return row ? { id: row.id, userId: row.user_id } : null;
}

// 分享頁用：由場次反查擁有者的分團設定
export async function getTeamAssignmentsByMatch(publicId: string): Promise<TeamMap> {
  await ready();
  const m = await resolveMatch(publicId);
  return m ? getTeamAssignments(m.userId) : {};
}

// 單場分團調整（優先級高於統一陣容配置）
export async function getMatchTeamOverrides(publicId: string): Promise<TeamMap> {
  await ready();
  const m = await resolveMatch(publicId);
  if (!m) return {};
  const rows = await db
    .selectFrom("match_team_assignments")
    .select(["player_name", "main_team", "sub_role"])
    .where("match_id", "=", m.id)
    .execute();
  const map: TeamMap = {};
  for (const r of rows) {
    map[r.player_name] = { mainTeam: r.main_team, subRole: r.sub_role };
  }
  return map;
}

// 使用者自訂的主團清單（依排序）
export async function getUserTeams(userId: number): Promise<UserTeam[]> {
  await ready();
  return db
    .selectFrom("user_teams")
    .select(["id", "name"])
    .where("user_id", "=", userId)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
}

// 分享頁用：由場次反查擁有者的主團清單
export async function getUserTeamsByMatch(publicId: string): Promise<UserTeam[]> {
  await ready();
  const m = await resolveMatch(publicId);
  return m ? getUserTeams(m.userId) : [];
}

// 使用者自訂的副職清單（依排序）
export async function getUserSubRoles(userId: number): Promise<UserSubRole[]> {
  await ready();
  return db
    .selectFrom("user_sub_roles")
    .select(["id", "name"])
    .where("user_id", "=", userId)
    .orderBy("sort_order")
    .orderBy("id")
    .execute();
}

// 分享頁用：由場次反查擁有者的副職清單
export async function getUserSubRolesByMatch(publicId: string): Promise<UserSubRole[]> {
  await ready();
  const m = await resolveMatch(publicId);
  return m ? getUserSubRoles(m.userId) : [];
}
