export interface PlayerStats {
  id?: number;
  name: string;
  cls: string;
  kills: number;
  assists: number;
  resources: number;
  playerDamage: number;
  buildingDamage: number;
  healing: number;
  damageTaken: number;
  deaths: number;
  purify: number; // 化羽/清泉
  burn: number; // 焚骨
}

export interface GuildSection {
  guildName: string;
  memberCount: number;
  players: PlayerStats[];
}

export interface ParsedMatch {
  ally: GuildSection;
  enemy: GuildSection;
}

export interface MatchSummary {
  id: number;
  title: string;
  allyName: string;
  allyCount: number;
  enemyName: string;
  enemyCount: number;
  shareToken: string | null;
  createdAt: string;
}

export interface MatchDetail extends MatchSummary {
  ally: PlayerStats[];
  enemy: PlayerStats[];
}

export const METRIC_LABELS: Record<string, string> = {
  kills: "擊敗",
  deaths: "重傷",
  assists: "助攻",
  playerDamage: "對玩家傷害",
  buildingDamage: "對建築傷害",
  healing: "治療值",
  damageTaken: "承受傷害",
  resources: "資源",
  purify: "化羽/清泉",
  burn: "焚骨",
};
