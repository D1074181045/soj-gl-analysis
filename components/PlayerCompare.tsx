"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlayerHistoryEntry } from "@/lib/data";
import { fmtAvg, fmtCompact, fmtDate, fmtInt, fmtKda, kdaOf } from "@/lib/format";
import { ChartTooltip, StatTile } from "./viz";

type MetricKey =
  | "kills"
  | "deaths"
  | "assists"
  | "playerDamage"
  | "buildingDamage"
  | "healing"
  | "damageTaken"
  | "resources";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "kills", label: "擊敗" },
  { key: "deaths", label: "重傷" },
  { key: "assists", label: "助攻" },
  { key: "playerDamage", label: "對玩家傷害" },
  { key: "buildingDamage", label: "對建築傷害" },
  { key: "healing", label: "治療值" },
  { key: "damageTaken", label: "承受傷害" },
  { key: "resources", label: "資源" },
];

export default function PlayerCompare({
  entries,
}: {
  entries: PlayerHistoryEntry[];
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("kills");

  const byName = useMemo(() => {
    const map = new Map<string, PlayerHistoryEntry[]>();
    for (const e of entries) {
      const list = map.get(e.stats.name) ?? [];
      list.push(e);
      map.set(e.stats.name, list);
    }
    return map;
  }, [entries]);

  const nameList = useMemo(() => {
    const q = search.trim();
    return [...byName.entries()]
      .filter(([name]) => !q || name.includes(q))
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-TW"))
      .slice(0, 60);
  }, [byName, search]);

  const history = selected ? byName.get(selected) ?? [] : [];

  const chartData = useMemo(
    () =>
      history.map((e, i) => ({
        label: `#${i + 1} vs ${e.opponentName}`,
        value: e.stats[metric],
      })),
    [history, metric]
  );

  const averages = useMemo(() => {
    if (history.length === 0) return null;
    const n = history.length;
    const s = (k: MetricKey) => history.reduce((acc, e) => acc + e.stats[k], 0);
    return {
      matches: n,
      kills: s("kills") / n,
      deaths: s("deaths") / n,
      assists: s("assists") / n,
      playerDamage: s("playerDamage") / n,
      healing: s("healing") / n,
      kda: kdaOf(s("kills"), s("deaths"), s("assists")),
    };
  }, [history]);

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-baseline p-8 text-center text-sm text-muted">
        尚無資料可比較，請先到
        <Link href="/dashboard" className="mx-1 text-accent hover:underline">
          我的場次
        </Link>
        上傳幫戰結算 CSV。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">玩家跨場比較</h1>
        <p className="mt-1 text-sm text-ink2">
          搜尋並選擇玩家，比較其在各場幫戰中的表現。
        </p>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row">
        <aside className="w-full shrink-0 rounded-xl border border-bdr bg-surface p-4 lg:w-64">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋玩家名字…"
            className="mb-3 w-full rounded-md border border-bdr bg-page px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
            {nameList.map(([name, list]) => (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm cursor-pointer ${
                  selected === name ? "bg-accent text-white" : "hover:bg-wash"
                }`}
              >
                <span className="truncate">{name}</span>
                <span
                  className={`ml-2 shrink-0 text-xs ${
                    selected === name ? "text-white/80" : "text-muted"
                  }`}
                >
                  {list.length} 場
                </span>
              </button>
            ))}
            {nameList.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted">
                找不到符合的玩家
              </p>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {!selected || !averages ? (
            <p className="rounded-xl border border-dashed border-baseline p-10 text-center text-sm text-muted">
              請從左側選擇一位玩家
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile label="場次" value={averages.matches} />
                <StatTile label="場均擊敗" value={fmtAvg(averages.kills)} />
                <StatTile label="場均重傷" value={fmtAvg(averages.deaths)} />
                <StatTile label="場均助攻" value={fmtAvg(averages.assists)} />
                <StatTile label="總 KDA" value={averages.kda.toFixed(1)} />
                <StatTile
                  label="場均對玩家傷害"
                  value={fmtCompact(averages.playerDamage)}
                />
              </div>

              <section className="rounded-xl border border-bdr bg-surface p-5">
                <h2 className="mb-3 font-semibold">
                  {selected} — 各場次「
                  {METRICS.find((m) => m.key === metric)!.label}」
                </h2>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMetric(m.key)}
                      className={`rounded-full px-3 py-1 text-xs cursor-pointer ${
                        metric === m.key
                          ? "bg-accent text-white"
                          : "border border-bdr text-ink2 hover:bg-wash"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--baseline)" }}
                      tickLine={false}
                    />
                    <YAxis
                      width={56}
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--wash)" }}
                      content={<ChartTooltip fmt={fmtInt} />}
                    />
                    <Bar
                      dataKey="value"
                      name={METRICS.find((m) => m.key === metric)!.label}
                      fill="var(--accent)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="rounded-xl border border-bdr bg-surface p-5">
                <h2 className="mb-3 font-semibold">各場次明細</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bdr text-left text-xs text-muted">
                        <th className="py-2 pr-3 font-normal">場次</th>
                        <th className="py-2 pr-3 font-normal">陣營</th>
                        <th className="py-2 pr-3 font-normal">職業</th>
                        <th className="py-2 pr-3 text-right font-normal">擊敗</th>
                        <th className="py-2 pr-3 text-right font-normal">重傷</th>
                        <th className="py-2 pr-3 text-right font-normal">助攻</th>
                        <th className="py-2 pr-3 text-right font-normal">KDA</th>
                        <th className="py-2 pr-3 text-right font-normal">對玩家傷害</th>
                        <th className="py-2 pr-3 text-right font-normal">治療值</th>
                        <th className="py-2 text-right font-normal">承受傷害</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {history.map((e) => (
                        <tr key={`${e.matchId}-${e.stats.id}`} className="border-b border-grid">
                          <td className="py-2 pr-3">
                            <Link
                              href={`/match/${e.matchId}`}
                              className="hover:text-accent"
                            >
                              {e.matchTitle}
                            </Link>
                            <span className="ml-2 text-xs text-muted">
                              {fmtDate(e.createdAt)}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-ink2">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block size-2 rounded-full"
                                style={{
                                  background:
                                    e.side === 0 ? "var(--ally)" : "var(--enemy)",
                                }}
                              />
                              {e.guildName}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-ink2">{e.stats.cls}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(e.stats.kills)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(e.stats.deaths)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(e.stats.assists)}</td>
                          <td className="py-2 pr-3 text-right">
                            {fmtKda(e.stats.kills, e.stats.deaths, e.stats.assists)}
                          </td>
                          <td
                            className="py-2 pr-3 text-right"
                            title={fmtInt(e.stats.playerDamage)}
                          >
                            {fmtCompact(e.stats.playerDamage)}
                          </td>
                          <td
                            className="py-2 pr-3 text-right"
                            title={fmtInt(e.stats.healing)}
                          >
                            {fmtCompact(e.stats.healing)}
                          </td>
                          <td
                            className="py-2 text-right"
                            title={fmtInt(e.stats.damageTaken)}
                          >
                            {fmtCompact(e.stats.damageTaken)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
