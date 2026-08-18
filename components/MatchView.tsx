"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MatchDetail, PlayerStats, TeamMap } from "@/lib/types";
import { MAIN_TEAMS } from "@/lib/types";
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
import ClassDetailModal from "./ClassDetailModal";
import Dropdown from "./Dropdown";

type Tab = "overview" | "class" | "players" | "teams";
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
  teams = {},
  shareBanner = false,
}: {
  match: MatchDetail;
  teams?: TeamMap;
  shareBanner?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const legendItems = [
    { label: match.allyName, color: ALLY_COLOR },
    { label: match.enemyName, color: ENEMY_COLOR },
  ];
  const hasTeams = match.ally.some((p) => teams[p.name]);
  const tabList: [Tab, string][] = [
    ["overview", "總覽"],
    ["class", "職業統計"],
    ["players", "玩家數據"],
  ];
  // 分享檢視只在擁有者有設定分團時才顯示此分頁
  if (!shareBanner || hasTeams) tabList.push(["teams", "分團統計"]);

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
        {tabList.map(([key, label]) => (
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
      {tab === "class" && <ClassTab match={match} teams={teams} legendItems={legendItems} />}
      {tab === "players" && <PlayersTab match={match} teams={teams} />}
      {tab === "teams" && (
        <TeamsTab match={match} teams={teams} isOwner={!shareBanner} />
      )}
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
  teams,
  legendItems,
}: {
  match: MatchDetail;
  teams: TeamMap;
  legendItems: { label: string; color: string }[];
}) {
  const [metric, setMetric] = useState<MetricKey>("kills");
  const [tableSide, setTableSide] = useState<0 | 1>(0);
  const [selectedCls, setSelectedCls] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(null);
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
                <tr
                  key={r.cls}
                  onClick={() => setSelectedCls(r.cls)}
                  className="cursor-pointer border-b border-grid hover:bg-wash"
                >
                  <td className="py-2 pr-3 font-medium">{r.cls}</td>
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
        <p className="mt-2 text-xs text-muted">
          表內數值皆為該職業平均，點選職業列可查看詳細與成員名單。
        </p>
      </section>

      {selectedCls && !selectedPlayer && (
        <ClassDetailModal
          cls={selectedCls}
          team={sidePlayers}
          guildName={tableSide === 0 ? match.allyName : match.enemyName}
          sideLabel={tableSide === 0 ? "我方" : "對方"}
          opponents={tableSide === 0 ? match.enemy : match.ally}
          opponentName={tableSide === 0 ? match.enemyName : match.allyName}
          onClose={() => setSelectedCls(null)}
          onSelectPlayer={(p) => setSelectedPlayer(p)}
        />
      )}
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          team={sidePlayers}
          guildName={tableSide === 0 ? match.allyName : match.enemyName}
          sideLabel={tableSide === 0 ? "我方" : "對方"}
          opponents={tableSide === 0 ? match.enemy : match.ally}
          opponentName={tableSide === 0 ? match.enemyName : match.allyName}
          teams={teams}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
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

function PlayersTab({ match, teams }: { match: MatchDetail; teams: TeamMap }) {
  const [side, setSide] = useState<0 | 1>(0);
  const [clsFilter, setClsFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("kills");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<PlayerStats | null>(null);
  const [clsDetail, setClsDetail] = useState<string | null>(null);

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
        <Dropdown
          value={clsFilter}
          onChange={setClsFilter}
          className="w-36"
          options={[
            { value: "", label: "全部職業" },
            ...classes.map((c) => ({ value: c, label: c })),
          ]}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋玩家名字…"
          className="w-44 rounded-md border border-bdr bg-page px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <span className="ml-auto text-xs text-muted">
          {rows.length} 位玩家 · 點選列看玩家詳情，點職業看職業詳情
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
                <td className="py-2 pr-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClsDetail(p.cls);
                    }}
                    className="text-ink2 underline decoration-dotted underline-offset-2 hover:text-accent cursor-pointer"
                  >
                    {p.cls}
                  </button>
                </td>
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

      {clsDetail && !selected && (
        <ClassDetailModal
          cls={clsDetail}
          team={team}
          guildName={guildName}
          sideLabel={side === 0 ? "我方" : "對方"}
          opponents={side === 0 ? match.enemy : match.ally}
          opponentName={side === 0 ? match.enemyName : match.allyName}
          onClose={() => setClsDetail(null)}
          onSelectPlayer={(p) => setSelected(p)}
        />
      )}
      {selected && (
        <PlayerDetailModal
          player={selected}
          team={team}
          guildName={guildName}
          sideLabel={side === 0 ? "我方" : "對方"}
          opponents={side === 0 ? match.enemy : match.ally}
          opponentName={side === 0 ? match.enemyName : match.allyName}
          teams={teams}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

const TEAM_METRICS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: "playerDamage", label: "對玩家傷害", fmt: fmtCompact },
  { key: "buildingDamage", label: "對建築傷害", fmt: fmtCompact },
  { key: "healing", label: "治療值", fmt: fmtCompact },
  { key: "damageTaken", label: "承受傷害", fmt: fmtCompact },
  { key: "kills", label: "擊敗", fmt: fmtInt },
  { key: "deaths", label: "重傷", fmt: fmtInt },
  { key: "assists", label: "助攻", fmt: fmtInt },
  { key: "resources", label: "資源", fmt: fmtInt },
];

function TeamsTab({
  match,
  teams,
  isOwner,
}: {
  match: MatchDetail;
  teams: TeamMap;
  isOwner: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("playerDamage");
  const [mode, setMode] = useState<"total" | "avg">("total");
  const [selected, setSelected] = useState<PlayerStats | null>(null);

  const groups = useMemo(() => {
    const g = new Map<string, PlayerStats[]>();
    for (const t of MAIN_TEAMS) g.set(t, []);
    g.set("未分團", []);
    for (const p of match.ally) {
      const a = teams[p.name];
      g.get(a ? a.mainTeam : "未分團")!.push(p);
    }
    for (const list of g.values()) {
      list.sort((a, b) => b.playerDamage - a.playerDamage);
    }
    return g;
  }, [match, teams]);

  const unassigned = groups.get("未分團")!;
  const assignedCount = match.ally.length - unassigned.length;

  const metricDef = TEAM_METRICS.find((m) => m.key === metric)!;
  const chartData = useMemo(
    () =>
      [...MAIN_TEAMS.map((t) => t as string), ...(unassigned.length ? ["未分團"] : [])].map(
        (t) => {
          const members = groups.get(t)!;
          const total = sum(members, metric);
          return {
            team: t === "未分團" ? t : `${t}團`,
            value: mode === "total" ? total : members.length ? total / members.length : 0,
          };
        }
      ),
    [groups, metric, mode, unassigned.length]
  );

  if (assignedCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-baseline p-10 text-center text-sm text-muted">
        尚未設定任何分團。
        {isOwner && (
          <>
            請先到「
            <a href="/teams" className="text-accent hover:underline">
              陣容配置
            </a>
            」把我方玩家分配到進攻／機動／防守團。
          </>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MAIN_TEAMS.map((t) => {
          const members = groups.get(t)!;
          const k = sum(members, "kills");
          const d = sum(members, "deaths");
          const a = sum(members, "assists");
          return (
            <div key={t} className="rounded-xl border border-bdr bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{t}團</h3>
                <span className="text-xs text-muted">{members.length} 人</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
                <dt className="text-muted">KDA</dt>
                <dd className="text-right">
                  {fmtKda(k, d, a)}
                  <span className="ml-1 text-xs text-muted">
                    ({fmtInt(k)}/{fmtInt(d)}/{fmtInt(a)})
                  </span>
                </dd>
                <dt className="text-muted">對玩家傷害</dt>
                <dd className="text-right">{fmtCompact(sum(members, "playerDamage"))}</dd>
                <dt className="text-muted">對建築傷害</dt>
                <dd className="text-right">{fmtCompact(sum(members, "buildingDamage"))}</dd>
                <dt className="text-muted">治療值</dt>
                <dd className="text-right">{fmtCompact(sum(members, "healing"))}</dd>
                <dt className="text-muted">承受傷害</dt>
                <dd className="text-right">{fmtCompact(sum(members, "damageTaken"))}</dd>
              </dl>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-bdr bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">各團對比（{match.allyName}）</h2>
          <div className="flex gap-1">
            {(
              [
                ["total", "總量"],
                ["avg", "人均"],
              ] as ["total" | "avg", string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 text-xs cursor-pointer ${
                  mode === m
                    ? "bg-accent text-white"
                    : "border border-bdr text-ink2 hover:bg-wash"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TEAM_METRICS.map((m) => (
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
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 24, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis
              dataKey="team"
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
              content={<ChartTooltip fmt={(n) => (mode === "avg" ? fmtAvg(n) : metricDef.fmt(n))} />}
            />
            <Bar
              dataKey="value"
              name={`${metricDef.label}（${mode === "total" ? "總量" : "人均"}）`}
              fill="var(--accent)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="value"
                position="top"
                fill="var(--ink-2)"
                fontSize={12}
                formatter={(v) =>
                  mode === "avg" ? fmtAvg(Number(v)) : metricDef.fmt(Number(v))
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {[...MAIN_TEAMS.map((t) => t as string), ...(unassigned.length ? ["未分團"] : [])].map(
        (t) => {
          const members = groups.get(t)!;
          if (members.length === 0) return null;
          return (
            <section key={t} className="rounded-xl border border-bdr bg-surface p-5">
              <h2 className="mb-3 font-semibold">
                {t === "未分團" ? "未分團" : `${t}團`}
                <span className="ml-2 text-xs font-normal text-muted">
                  {members.length} 人・依對玩家傷害排序・點選列看玩家詳情
                </span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bdr text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-normal">玩家</th>
                      <th className="py-2 pr-3 font-normal">職業</th>
                      <th className="py-2 pr-3 font-normal">副職</th>
                      <th className="py-2 pr-3 text-right font-normal">擊敗</th>
                      <th className="py-2 pr-3 text-right font-normal">重傷</th>
                      <th className="py-2 pr-3 text-right font-normal">助攻</th>
                      <th className="py-2 pr-3 text-right font-normal">KDA</th>
                      <th className="py-2 pr-3 text-right font-normal">對玩家傷害</th>
                      <th className="py-2 pr-3 text-right font-normal">對建築傷害</th>
                      <th className="py-2 pr-3 text-right font-normal">治療值</th>
                      <th className="py-2 text-right font-normal">承受傷害</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {members.map((p) => (
                      <tr
                        key={p.id ?? p.name}
                        onClick={() => setSelected(p)}
                        className="cursor-pointer border-b border-grid hover:bg-wash"
                      >
                        <td className="py-2 pr-3 font-medium">{p.name}</td>
                        <td className="py-2 pr-3 text-ink2">{p.cls}</td>
                        <td className="py-2 pr-3">
                          {teams[p.name]?.subRole ? (
                            <span className="rounded border border-bdr px-1.5 py-0.5 text-xs text-ink2">
                              {teams[p.name]!.subRole}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
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
                        <td className="py-2 text-right" title={fmtInt(p.damageTaken)}>
                          {fmtCompact(p.damageTaken)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        }
      )}

      {selected && (
        <PlayerDetailModal
          player={selected}
          team={match.ally}
          guildName={match.allyName}
          sideLabel="我方"
          opponents={match.enemy}
          opponentName={match.enemyName}
          teams={teams}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
