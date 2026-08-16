// 客戶端/伺服器皆可用的數值格式化
export function fmtInt(n: number): string {
  return n.toLocaleString("zh-TW");
}

const compact = new Intl.NumberFormat("zh-TW", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// 大數值以「萬 / 億」壓縮顯示（例：2513.4萬）
export function fmtCompact(n: number): string {
  if (Math.abs(n) < 10000) return fmtInt(Math.round(n));
  return compact.format(n);
}

export function kdaOf(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

export function fmtKda(kills: number, deaths: number, assists: number): string {
  return kdaOf(kills, deaths, assists).toFixed(1);
}

export function fmtAvg(n: number): string {
  return Math.abs(n) >= 10000 ? fmtCompact(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function fmtDate(iso: string): string {
  // SQLite datetime('now') 為 UTC，加上 Z 讓瀏覽器轉當地時間
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}
