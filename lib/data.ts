import db from "./db";
import type { MatchDetail, MatchSummary, PlayerStats } from "./types";

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
