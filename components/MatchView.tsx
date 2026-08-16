"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MatchDetail, PlayerStats } from "@/lib/types";
import { fmtAvg, fmtCompact, fmtDate, fmtInt, fmtKda, kdaOf } from "@/lib/format";
import {
  ALLY_COLOR,
  ENEMY_COLOR,
  ChartTooltip,
  CompareRow,
  SeriesLegend,
  StatTile,
} from "./viz";
import PlayerDetailModal from "./PlayerDetailModal";

type Tab = "overview" | "class" | "players";
type MetricKey =
  | "kills"
  | "deaths"
  | "assists"
  | "playerDamage"
  | "buildingDamage"
  | "healing"
  | "damageTaken"
  | "resources";

const OVERVIEW_METRICS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: "kills", label: "擊敗", fmt: fmtInt },
  { key: "deaths", label: "重傷", fmt: fmtInt },
  { key: "assists", label: "助攻", fmt: fmtInt },
  { key: "playerDamage", label: "對玩家傷害", fmt: fmtCompact },
  { key: "buildingDamage", label: "對建築傷害", fmt: fmtCompact },
  { key: "healing", label: "治療值", fmt: fmtCompact },
  { key: "damageTaken", label: "承受傷害", fmt: fmtCompact },
  { key: "resources", label: "資源", fmt: fmtInt },
];

const CLASS_METRICS: { key: MetricKey; label: string }[] = [
  { key: "kills", label: "平均擊敗" },
  { key: "deaths", label: "平均重傷" },
  { key: "assists", label: "平均助攻" },
  { key: "playerDamage", label: "平均對玩家傷害" },
  { key: "buildingDamage", label: "平均對建築傷害" },
  { key: "healing", label: "平均治療值" },
  { key: "damageTaken", label: "平均承受傷害" },
];

function sum(players: PlayerStats[], key: MetricKey): number {
  return players.reduce((s, p) => s + p[key], 0);
}

function avg(players: PlayerStats[], key: MetricKey): number {
  return players.length ? sum(players, key) / players.length : 0;
}

export default function MatchView({
  match,
  shareBanner = false,
}: {
  match: MatchDetail;
  shareBanner?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const legendItems = [
    { label: match.allyName, color: ALLY_COLOR },
    { label: match.enemyName, color: ENEMY_COLOR },
  ];

  return (
    <div className="flex flex-col gap-5">
      {shareBanner && (
        <p className="rounded-lg border border-bdr bg-surface px-4 py-2.5 text-sm text-ink2">
          此為分享的唯讀戰報檢視。
        </p>
      )}

      <header>
        <h1 className="text-xl font-semibold">{match.title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-ally" />
            {match.allyName}（{match.allyCount} 人）
          </span>
          <span className="text-muted">vs</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-enemy" />
            {match.enemyName}（{match.enemyCount} 人）
          </span>
          <span className="text-xs text-muted">・{fmtDate(match.createdAt)} 上傳</span>
        </p>
      </header>

      <nav className="flex gap-1 border-b border-bdr">
        {(
          [
            ["overview", "總覽"],
            ["class", "職業統計"],
            ["players", "玩家數據"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm cursor-pointer ${
              tab === key
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab match={match} legendItems={legendItems} />}
      {tab === "class" && <ClassTab match={match} legendItems={legendItems} />}
      {tab === "players" && <PlayersTab match={match} />}
    </div>
  );
}

function OverviewTab({
  match,
  legendItems,
}: {
  match: MatchDetail;
  legendItems: { label: string; color: string }[];
}) {
  const classData = useMemo(() => {
    const classes = new Map<string, { cls: string; ally: number; enemy: number }>();
    for (const p of match.ally) {
      const e = classes.get(p.cls) ?? { cls: p.cls, ally: 0, enemy: 0 };
      e.ally += 1;
      classes.set(p.cls, e);
    }
    for (const p of match.enemy) {
      const e = classes.get(p.cls) ?? { cls: p.cls, ally: 0, enemy: 0 };
      e.enemy += 1;
      classes.set(p.cls, e);
    }
    return [...classes.values()].sort(
      (a, b) => b.ally + b.enemy - (a.ally + a.enemy)
    );
  }, [match]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="我方 KDA"
          value={fmtKda(
            sum(match.ally, "kills"),
            sum(match.ally, "deaths"),
            sum(match.ally, "assists")
          )}
          sub={`${fmtInt(sum(match.ally, "kills"))} / ${fmtInt(
            sum(match.ally, "deaths")
          )} / ${fmtInt(sum(match.ally, "assists"))}`}
        />
        <StatTile
          label="對方 KDA"
          value={fmtKda(
            sum(match.enemy, "kills"),
            sum(match.enemy, "deaths"),
            sum(match.enemy, "assists")
          )}
          sub={`${fmtInt(sum(match.enemy, "kills"))} / ${fmtInt(
            sum(match.enemy, "deaths")
          )} / ${fmtInt(sum(match.enemy, "assists"))}`}
        />
        <StatTile
          label="我方對玩家傷害"
          value={fmtCompact(sum(match.ally, "playerDamage"))}
        />
        <StatTile
          label="對方對玩家傷害"
          value={fmtCompact(sum(match.enemy, "playerDamage"))}
        />
      </div>

      <section className="rounded-xl border border-bdr bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">全隊數據對比</h2>
          <SeriesLegend items={legendItems} />
        </div>
        <div className="flex flex-col gap-3.5">
          {OVERVIEW_METRICS.map((m) => (
            <CompareRow
              key={m.key}
              label={m.label}
              a={sum(match.ally, m.key)}
              b={sum(match.enemy, m.key)}
              fmt={m.fmt}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-bdr bg-surface p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">職業構成（人數）</h2>
          <SeriesLegend items={legendItems} />
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={classData} barGap={2} margin={{ top: 8, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="cls"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--baseline)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={32}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--wash)" }}
              content={<ChartTooltip fmt={fmtInt} />}
            />
            <Bar
              dataKey="ally"
              name={match.allyName}
              fill={ALLY_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            <Bar
              dataKey="enemy"
              name={match.enemyName}
              fill={ENEMY_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function ClassTab({
  match,
  legendItems,
}: {
  match: MatchDetail;
  legendItems: { label: string; color: string }[];
}) {
  const [metric, setMetric] = useState<MetricKey>("kills");
  const [tableSide, setTableSide] = useState<0 | 1>(0);
  const metricLabel = CLASS_METRICS.find((m) => m.key === metric)!.label;

  const classes = useMemo(() => {
    const set = new Set<string>();
    for (const p of [...match.ally, ...match.enemy]) set.add(p.cls);
    return [...set].sort();
  }, [match]);

  const chartData = useMemo(
    () =>
      classes.map((cls) => ({
        cls,
        ally: avg(match.ally.filter((p) => p.cls === cls), metric),
        enemy: avg(match.enemy.filter((p) => p.cls === cls), metric),
      })),
    [classes, match, metric]
  );

  const sidePlayers = tableSide === 0 ? match.ally : match.enemy;
  const tableRows = useMemo(
    () =>
      classes
        .map((cls) => {
          const group = sidePlayers.filter((p) => p.cls === cls);
          return group.length === 0
            ? null
            : {
                cls,
                count: group.length,
                kills: avg(group, "kills"),
                deaths: avg(group, "deaths"),
                assists: avg(group, "assists"),
                playerDamage: avg(group, "playerDamage"),
                buildingDamage: avg(group, "buildingDamage"),
                healing: avg(group, "healing"),
                damageTaken: avg(group, "damageTaken"),
              };
        })
        .filter((r) => r !== null),
    [classes, sidePlayers]
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-bdr bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">各職業平均對比</h2>
          <SeriesLegend items={legendItems} />
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CLASS_METRICS.map((m) => (
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
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="cls"
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
              content={<ChartTooltip fmt={fmtAvg} />}
            />
            <Bar
              dataKey="ally"
              name={match.allyName}
              fill={ALLY_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            <Bar
              dataKey="enemy"
              name={match.enemyName}
              fill={ENEMY_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted">目前指標：{metricLabel}</p>
      </section>

      <section className="rounded-xl border border-bdr bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">職業平均一覽</h2>
          <div className="flex gap-1">
            {(
              [
                [0, match.allyName],
                [1, match.enemyName],
              ] as [0 | 1, string][]
            ).map(([side, name]) => (
              <button
                key={side}
                onClick={() => setTableSide(side)}
                className={`rounded-md px-3 py-1 text-xs cursor-pointer ${
                  tableSide === side
                    ? "bg-accent text-white"
                    : "border border-bdr text-ink2 hover:bg-wash"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdr text-left text-xs text-muted">
                <th className="py-2 pr-3 font-normal">職業</th>
                <th className="py-2 pr-3 text-right font-normal">人數</th>
                <th className="py-2 pr-3 text-right font-normal">擊敗</th>
                <th className="py-2 pr-3 text-right font-normal">重傷</th>
                <th className="py-2 pr-3 text-right font-normal">助攻</th>
                <th className="py-2 pr-3 text-right font-normal">對玩家傷害</th>
                <th className="py-2 pr-3 text-right font-normal">對建築傷害</th>
                <th className="py-2 pr-3 text-right font-normal">治療值</th>
                <th className="py-2 text-right font-normal">承受傷害</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {tableRows.map((r) => (
                <tr key={r.cls} className="border-b border-grid">
                  <td className="py-2 pr-3">{r.cls}</td>
                  <td className="py-2 pr-3 text-right">{r.count}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.kills)}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.deaths)}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.assists)}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.playerDamage)}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.buildingDamage)}</td>
                  <td className="py-2 pr-3 text-right">{fmtAvg(r.healing)}</td>
                  <td className="py-2 text-right">{fmtAvg(r.damageTaken)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">表內數值皆為該職業平均。</p>
      </section>
    </div>
  );
}

type SortKey =
  | "name"
  | "cls"
  | "kda"
  | MetricKey;

const PLAYER_COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "玩家", numeric: false },
  { key: "cls", label: "職業", numeric: false },
  { key: "kills", label: "擊敗", numeric: true },
  { key: "deaths", label: "重傷", numeric: true },
  { key: "assists", label: "助攻", numeric: true },
  { key: "kda", label: "KDA", numeric: true },
  { key: "playerDamage", label: "對玩家傷害", numeric: true },
  { key: "buildingDamage", label: "對建築傷害", numeric: true },
  { key: "healing", label: "治療值", numeric: true },
  { key: "damageTaken", label: "承受傷害", numeric: true },
  { key: "resources", label: "資源", numeric: true },
];

function PlayersTab({ match }: { match: MatchDetail }) {
  const [side, setSide] = useState<0 | 1>(0);
  const [clsFilter, setClsFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("kills");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<PlayerStats | null>(null);

  const team = side === 0 ? match.ally : match.enemy;
  const guildName = side === 0 ? match.allyName : match.enemyName;

  const classes = useMemo(
    () => [...new Set(team.map((p) => p.cls))].sort(),
    [team]
  );

  const rows = useMemo(() => {
    let list = team;
    if (clsFilter) list = list.filter((p) => p.cls === clsFilter);
    if (search.trim())
      list = list.filter((p) => p.name.includes(search.trim()));
    const valOf = (p: PlayerStats): number | string =>
      sortKey === "kda"
        ? kdaOf(p.kills, p.deaths, p.assists)
        : p[sortKey as keyof PlayerStats] ?? 0;
    return [...list].sort((a, b) => {
      const va = valOf(a);
      const vb = valOf(b);
      const cmp =
        typeof va === "string"
          ? va.localeCompare(String(vb), "zh-TW")
          : Number(va) - Number(vb);
      return sortDesc ? -cmp : cmp;
    });
  }, [team, clsFilter, search, sortKey, sortDesc]);

  const toggleSort = (key: SortKey, numeric: boolean) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(numeric); // 數值欄預設由大到小，文字欄由小到大
    }
  };

  return (
    <section className="rounded-xl border border-bdr bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(
            [
              [0, match.allyName],
              [1, match.enemyName],
            ] as [0 | 1, string][]
          ).map(([s, name]) => (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                setClsFilter("");
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm cursor-pointer ${
                side === s
                  ? "bg-accent text-white"
                  : "border border-bdr text-ink2 hover:bg-wash"
              }`}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{
                  background: s === 0 ? "var(--ally)" : "var(--enemy)",
                  outline: side === s ? "2px solid rgba(255,255,255,0.6)" : "none",
                }}
              />
              {name}
            </button>
          ))}
        </div>
        <select
          value={clsFilter}
          onChange={(e) => setClsFilter(e.target.value)}
          className="rounded-md border border-bdr bg-page px-2.5 py-1.5 text-sm"
        >
          <option value="">全部職業</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋玩家名字…"
          className="w-44 rounded-md border border-bdr bg-page px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <span className="ml-auto text-xs text-muted">
          {rows.length} 位玩家 · 點選列可查看詳細貢獻
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bdr text-left text-xs text-muted">
              {PLAYER_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`py-2 pr-3 font-normal ${c.numeric ? "text-right" : ""}`}
                >
                  <button
                    onClick={() => toggleSort(c.key, c.numeric)}
                    className="cursor-pointer hover:text-ink"
                  >
                    {c.label}
                    {sortKey === c.key && (sortDesc ? " ↓" : " ↑")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((p) => (
              <tr
                key={p.id ?? p.name}
                onClick={() => setSelected(p)}
                className="cursor-pointer border-b border-grid hover:bg-wash"
              >
                <td className="py-2 pr-3 font-medium">{p.name}</td>
                <td className="py-2 pr-3 text-ink2">{p.cls}</td>
                <td className="py-2 pr-3 text-right">{fmtInt(p.kills)}</td>
                <td className="py-2 pr-3 text-right">{fmtInt(p.deaths)}</td>
                <td className="py-2 pr-3 text-right">{fmtInt(p.assists)}</td>
                <td className="py-2 pr-3 text-right">
                  {fmtKda(p.kills, p.deaths, p.assists)}
                </td>
                <td className="py-2 pr-3 text-right" title={fmtInt(p.playerDamage)}>
                  {fmtCompact(p.playerDamage)}
                </td>
                <td className="py-2 pr-3 text-right" title={fmtInt(p.buildingDamage)}>
                  {fmtCompact(p.buildingDamage)}
                </td>
                <td className="py-2 pr-3 text-right" title={fmtInt(p.healing)}>
                  {fmtCompact(p.healing)}
                </td>
                <td className="py-2 pr-3 text-right" title={fmtInt(p.damageTaken)}>
                  {fmtCompact(p.damageTaken)}
                </td>
                <td className="py-2 text-right">{fmtInt(p.resources)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PlayerDetailModal
          player={selected}
          team={team}
          guildName={guildName}
          sideLabel={side === 0 ? "我方" : "對方"}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
