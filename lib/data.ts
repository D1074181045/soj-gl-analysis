import db from "./db";
import type {
  MatchDetail,
  MatchSummary,
  MainTeam,
  PlayerStats,
  RosterEntry,
  SubRole,
  TeamMap,
} from "./types";

interface PlayerRow {
  id: number;
  side: number;
  name: string;
  cls: string;
  kills: number;
  assists: number;
  resources: number;
  player_damage: number;
  building_damage: number;
  healing: number;
  damage_taken: number;
  deaths: number;
  purify: number;
  burn: number;
}

interface MatchRow {
  id: number;
  title: string;
  ally_name: string;
  ally_count: number;
  enemy_name: string;
  enemy_count: number;
  share_token: string | null;
  created_at: string;
}

function toPlayer(r: PlayerRow): PlayerStats {
  return {
    id: r.id,
    name: r.name,
    cls: r.cls,
    kills: r.kills,
    assists: r.assists,
    resources: r.resources,
    playerDamage: r.player_damage,
    buildingDamage: r.building_damage,
    healing: r.healing,
    damageTaken: r.damage_taken,
    deaths: r.deaths,
    purify: r.purify,
    burn: r.burn,
  };
}

function toSummary(r: MatchRow): MatchSummary {
  return {
    id: r.id,
    title: r.title,
    allyName: r.ally_name,
    allyCount: r.ally_count,
    enemyName: r.enemy_name,
    enemyCount: r.enemy_count,
    shareToken: r.share_token,
    createdAt: r.created_at,
  };
}

export function getUserMatches(userId: number): MatchSummary[] {
  const rows = db
    .prepare("SELECT * FROM matches WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as MatchRow[];
  return rows.map(toSummary);
}

function attachPlayers(match: MatchRow): MatchDetail {
  const players = db
    .prepare("SELECT * FROM players WHERE match_id = ? ORDER BY id")
    .all(match.id) as PlayerRow[];
  return {
    ...toSummary(match),
    ally: players.filter((p) => p.side === 0).map(toPlayer),
    enemy: players.filter((p) => p.side === 1).map(toPlayer),
  };
}

export function getMatchForUser(matchId: number, userId: number): MatchDetail | null {
  const row = db
    .prepare("SELECT * FROM matches WHERE id = ? AND user_id = ?")
    .get(matchId, userId) as MatchRow | undefined;
  return row ? attachPlayers(row) : null;
}

export function getMatchByShareToken(token: string): MatchDetail | null {
  const row = db
    .prepare("SELECT * FROM matches WHERE share_token = ?")
    .get(token) as MatchRow | undefined;
  return row ? attachPlayers(row) : null;
}

export interface PlayerHistoryEntry {
  matchId: number;
  matchTitle: string;
  createdAt: string;
  side: number;
  guildName: string;
  opponentName: string;
  stats: PlayerStats;
}

// 該使用者所有場次中出現過的玩家（供跨場比較選擇）
export function getPlayerHistoryIndex(userId: number): PlayerHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT p.*, m.id AS match_id, m.title, m.created_at,
              m.ally_name, m.enemy_name
       FROM players p JOIN matches m ON m.id = p.match_id
       WHERE m.user_id = ?
       ORDER BY m.created_at ASC, m.id ASC, p.id ASC`
    )
    .all(userId) as (PlayerRow & {
    match_id: number;
    title: string;
    created_at: string;
    ally_name: string;
    enemy_name: string;
  })[];
  return rows.map((r) => ({
    matchId: r.match_id,
    matchTitle: r.title,
    createdAt: r.created_at,
    side: r.side,
    guildName: r.side === 0 ? r.ally_name : r.enemy_name,
    opponentName: r.side === 0 ? r.enemy_name : r.ally_name,
    stats: toPlayer(r),
  }));
}

// 我方名單：該使用者所有場次中 side=0 的不重複玩家（職業取最近一場）
export function getAllyRoster(userId: number): RosterEntry[] {
  const rows = db
    .prepare(
      `SELECT p.name, p.cls, m.created_at
       FROM players p JOIN matches m ON m.id = p.match_id
       WHERE m.user_id = ? AND p.side = 0
       ORDER BY m.created_at ASC, m.id ASC`
    )
    .all(userId) as { name: string; cls: string; created_at: string }[];
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

export function getTeamAssignments(userId: number): TeamMap {
  const rows = db
    .prepare(
      "SELECT player_name, main_team, sub_role FROM team_assignments WHERE user_id = ?"
    )
    .all(userId) as {
    player_name: string;
    main_team: MainTeam;
    sub_role: SubRole | null;
  }[];
  const map: TeamMap = {};
  for (const r of rows) {
    map[r.player_name] = { mainTeam: r.main_team, subRole: r.sub_role };
  }
  return map;
}

// 分享頁用：由場次反查擁有者的分團設定
export function getTeamAssignmentsByMatch(matchId: number): TeamMap {
  const row = db
    .prepare("SELECT user_id FROM matches WHERE id = ?")
    .get(matchId) as { user_id: number } | undefined;
  return row ? getTeamAssignments(row.user_id) : {};
}

// 單場分團調整（優先級高於統一陣容配置）
export function getMatchTeamOverrides(matchId: number): TeamMap {
  const rows = db
    .prepare(
      "SELECT player_name, main_team, sub_role FROM match_team_assignments WHERE match_id = ?"
    )
    .all(matchId) as {
    player_name: string;
    main_team: MainTeam;
    sub_role: SubRole | null;
  }[];
  const map: TeamMap = {};
  for (const r of rows) {
    map[r.player_name] = { mainTeam: r.main_team, subRole: r.sub_role };
  }
  return map;
}
