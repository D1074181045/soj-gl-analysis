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

// 職業專屬指標：化羽/清泉僅素問與潮光有意義，焚骨僅九靈
export function metricAppliesToClass(key: string, cls: string): boolean {
  if (key === "purify") return cls === "素問" || cls === "潮光";
  if (key === "burn") return cls === "九靈";
  return true;
}

// 分團：主團必選三選一；副職可不選，選則三選一
export const MAIN_TEAMS = ["進攻", "機動", "防守"] as const;
export const SUB_ROLES = ["保鑣", "扛拆", "空拆"] as const;
export type MainTeam = (typeof MAIN_TEAMS)[number];
export type SubRole = (typeof SUB_ROLES)[number];

export interface TeamAssignment {
  mainTeam: MainTeam;
  subRole: SubRole | null;
}

// 玩家名字 → 分團設定（以名字為鍵、跨場次共用）
export type TeamMap = Record<string, TeamAssignment>;

export interface RosterEntry {
  name: string;
  cls: string; // 最近一場的職業
  matchCount: number;
}
