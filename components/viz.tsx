"use client";

import type { ReactNode } from "react";

// 兩軍固定色：我方=藍（slot 1）、對方=橘（slot 2），已通過明暗兩模式色盤驗證
export const ALLY_COLOR = "var(--ally)";
export const ENEMY_COLOR = "var(--enemy)";

export function SeriesLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-sm text-ink2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// 單一指標的雙方對比列：兩條水平長條共用同一比例尺
// colors 預設為我方藍/對方橘，可依情境調換
export function CompareRow({
  label,
  a,
  b,
  fmt,
  colors = [ALLY_COLOR, ENEMY_COLOR],
}: {
  label: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  colors?: [string, string];
}) {
  const max = Math.max(a, b, 1);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-ink2">{label}</span>
      <div className="flex flex-1 flex-col gap-0.5">
        {[
          { v: a, color: colors[0] },
          { v: b, color: colors[1] },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3.5 flex-1">
              <div
                className="h-full rounded-r"
                style={{
                  width: `${Math.max((row.v / max) * 100, row.v > 0 ? 0.8 : 0)}%`,
                  background: row.color,
                }}
              />
            </div>
            <span
              className="w-20 shrink-0 text-right text-xs text-ink tabular-nums"
              title={row.v.toLocaleString("zh-TW")}
            >
              {fmt(row.v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 貢獻佔比量表：accent 填色 + 同色系淺階軌道
export function ContributionMeter({
  label,
  value,
  ratio,
  rank,
  total,
  fmt,
}: {
  label: string;
  value: number;
  ratio: number;
  rank: number;
  total: number;
  fmt: (n: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink2">{label}</span>
        <span className="text-ink tabular-nums" title={value.toLocaleString("zh-TW")}>
          {fmt(value)}
          <span className="ml-2 text-xs text-muted">
            佔全隊 {(ratio * 100).toFixed(1)}% · 第 {rank}/{total} 名
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-accent-track">
        <div
          className="h-full rounded-r-full bg-accent"
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-bdr bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink2">{sub}</p>}
    </div>
  );
}

// Recharts 自訂 tooltip
export function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-bdr bg-surface px-3 py-2 text-sm shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-ink2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}：
          <span className="text-ink tabular-nums">{fmt(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}
