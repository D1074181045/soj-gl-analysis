import type { GuildSection, ParsedMatch, PlayerStats } from "./types";

// 幫會聯賽結算 CSV 格式：
//   "幫會名","人數"
//   "玩家名字","職業","擊敗","助攻","資源","對玩家傷害","對建築傷害","治療值","承受傷害","重傷","化羽/清泉","焚骨"
//   ...每位玩家一列（12 欄）...
//   （空行）
//   "對方幫會名","人數"
//   （標題列 + 玩家列）
// 解析策略：逐行掃描，2 欄且第二欄為數字 → 幫會標頭；12 欄且非標題列 → 玩家列。

function parseLine(line: string): string[] {
  const fields: string[] = [];
  const re = /"((?:[^"]|"")*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    fields.push(m[1].replace(/""/g, '"'));
  }
  return fields;
}

function num(s: string): number {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function decodeCsv(buf: Buffer): string {
  let text = buf.toString("utf8");
  // 若 UTF-8 解碼出現替換字元，改用 GB18030（遊戲匯出常見編碼）
  if (text.includes("�")) {
    try {
      text = new TextDecoder("gb18030").decode(buf);
    } catch {
      /* 保留 utf8 結果 */
    }
  }
  return text.replace(/^﻿/, "");
}

export function parseGuildWarCsv(text: string): ParsedMatch {
  const sections: GuildSection[] = [];
  let current: GuildSection | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = parseLine(line);
    if (fields.length === 2 && /^\d+$/.test(fields[1].trim())) {
      current = { guildName: fields[0], memberCount: num(fields[1]), players: [] };
      sections.push(current);
      continue;
    }
    if (fields.length === 12) {
      if (fields[0] === "玩家名字") continue; // 標題列
      if (!current) throw new Error("CSV 格式錯誤：玩家列出現在幫會標頭之前");
      const p: PlayerStats = {
        name: fields[0],
        cls: fields[1],
        kills: num(fields[2]),
        assists: num(fields[3]),
        resources: num(fields[4]),
        playerDamage: num(fields[5]),
        buildingDamage: num(fields[6]),
        healing: num(fields[7]),
        damageTaken: num(fields[8]),
        deaths: num(fields[9]),
        purify: num(fields[10]),
        burn: num(fields[11]),
      };
      current.players.push(p);
    }
  }

  if (sections.length !== 2) {
    throw new Error(
      `CSV 格式錯誤：預期 2 個幫會區塊，實際解析到 ${sections.length} 個`
    );
  }
  if (sections[0].players.length === 0 || sections[1].players.length === 0) {
    throw new Error("CSV 格式錯誤：幫會區塊內沒有玩家資料");
  }
  return { ally: sections[0], enemy: sections[1] };
}
