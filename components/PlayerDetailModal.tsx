"use client";

import { useEffect, useMemo } from "react";
import type { PlayerStats } from "@/lib/types";
import { metricAppliesToClass } from "@/lib/types";
import { fmtAvg, fmtCompact, fmtInt, fmtKda } from "@/lib/format";
import { ALLY_COLOR, ENEMY_COLOR, CompareRow, ContributionMeter, SeriesLegend, StatTile } from "./viz";

const CONTRIB_METRICS: { key: keyof PlayerStats; label: string }[] = [
  { key: "kills", label: "擊敗" },
  { key: "assists", label: "助攻" },
  { key: "playerDamage", label: "對玩家傷害" },
  { key: "buildingDamage", label: "對建築傷害" },
  { key: "healing", label: "治療值" },
  { key: "damageTaken", label: "承受傷害" },
  { key: "resources", label: "資源" },
  { key: "purify", label: "化羽/清泉" },
  { key: "burn", label: "焚骨" },
];

const VS_CLASS_METRICS: { key: keyof PlayerStats; label: string }[] = [
  { key: "kills", label: "擊敗" },
  { key: "deaths", label: "重傷" },
  { key: "assists", label: "助攻" },
  { key: "playerDamage", label: "對玩家傷害" },
  { key: "healing", label: "治療值" },
  { key: "damageTaken", label: "承受傷害" },
];

// 與對方同職業平均比較的指標（化羽/焚骨依職業過濾）
const VS_ENEMY_METRICS: {
  key: keyof PlayerStats;
  label: string;
  fmt: (n: number) => string;
}[] = [
  { key: "kills", label: "擊敗", fmt: fmtAvg },
  { key: "deaths", label: "重傷", fmt: fmtAvg },
  { key: "assists", label: "助攻", fmt: fmtAvg },
  { key: "playerDamage", label: "對玩家傷害", fmt: fmtCompact },
  { key: "buildingDamage", label: "對建築傷害", fmt: fmtCompact },
  { key: "healing", label: "治療值", fmt: fmtCompact },
  { key: "damageTaken", label: "承受傷害", fmt: fmtCompact },
  { key: "purify", label: "化羽/清泉", fmt: fmtAvg },
  { key: "burn", label: "焚骨", fmt: fmtAvg },
];

function numOf(p: PlayerStats, key: keyof PlayerStats): number {
  return Number(p[key] ?? 0);
}

export default function PlayerDetailModal({
  player,
  team,
  guildName,
  sideLabel,
  opponents,
  opponentName,
  onClose,
}: {
  player: PlayerStats;
  team: PlayerStats[];
  guildName: string;
  sideLabel: "我方" | "對方";
  opponents: PlayerStats[];
  opponentName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const contributions = useMemo(() => {
    return CONTRIB_METRICS.filter(({ key }) =>
      metricAppliesToClass(key as string, player.cls)
    )
      .map(({ key, label }) => {
      const value = numOf(player, key);
      const total = team.reduce((s, p) => s + numOf(p, key), 0);
      const rank =
        team.filter((p) => numOf(p, key) > value).length + 1;
      return {
        key,
        label,
        value,
        ratio: total > 0 ? value / total : 0,
        rank,
        teamTotal: total,
      };
    }).filter((c) => c.teamTotal > 0);
  }, [player, team]);

  const classmates = useMemo(
    () => team.filter((p) => p.cls === player.cls),
    [team, player.cls]
  );

  const vsClass = useMemo(() => {
    return VS_CLASS_METRICS.map(({ key, label }) => {
      const value = numOf(player, key);
      const avg =
        classmates.reduce((s, p) => s + numOf(p, key), 0) /
        Math.max(classmates.length, 1);
      return { key, label, value, avg };
    });
  }, [player, classmates]);

  const enemyClassmates = useMemo(
    () => opponents.filter((p) => p.cls === player.cls),
    [opponents, player.cls]
  );

  const vsEnemy = useMemo(() => {
    return VS_ENEMY_METRICS.filter(({ key }) =>
      metricAppliesToClass(key as string, player.cls)
    ).map(({ key, label, fmt }) => {
      const value = numOf(player, key);
      const avg =
        enemyClassmates.reduce((s, p) => s + numOf(p, key), 0) /
        Math.max(enemyClassmates.length, 1);
      return { key, label, fmt, value, avg };
    });
  }, [player, enemyClassmates]);

  // 本人長條用自己陣營的顏色，對方平均用另一方顏色
  const ownColor = sideLabel === "我方" ? ALLY_COLOR : ENEMY_COLOR;
  const oppColor = sideLabel === "我方" ? ENEMY_COLOR : ALLY_COLOR;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:py-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-bdr bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{player.name}</h3>
            <p className="mt-0.5 text-sm text-ink2">
              {player.cls} ·{" "}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{
                    background: sideLabel === "我方" ? "var(--ally)" : "var(--enemy)",
                  }}
                />
                {guildName}（{sideLabel}）
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="rounded-md border border-bdr px-2.5 py-1 text-sm text-ink2 hover:bg-wash cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="擊敗" value={fmtInt(player.kills)} />
          <StatTile label="重傷（死亡）" value={fmtInt(player.deaths)} />
          <StatTile label="助攻" value={fmtInt(player.assists)} />
          <StatTile
            label="KDA"
            value={fmtKda(player.kills, player.deaths, player.assists)}
            sub="（擊敗＋助攻）÷ 重傷"
          />
        </div>

        <h4 className="mb-3 mt-6 text-sm font-semibold text-ink2">
          全隊貢獻佔比（{guildName}）
        </h4>
        <div className="flex flex-col gap-3.5">
          {contributions.map((c) => (
            <ContributionMeter
              key={c.key}
              label={c.label}
              value={c.value}
              ratio={c.ratio}
              rank={c.rank}
              total={team.length}
              fmt={fmtCompact}
            />
          ))}
        </div>

        <h4 className="mb-3 mt-6 text-sm font-semibold text-ink2">
          與同職業平均比較（{player.cls}，同隊 {classmates.length} 人）
        </h4>
        <div className="flex flex-col gap-2.5">
          {vsClass.map((m) => {
            const max = Math.max(m.value, m.avg, 1);
            const diff = m.avg > 0 ? (m.value - m.avg) / m.avg : 0;
            return (
              <div key={m.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-ink2">{m.label}</span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1">
                      <div
                        className="h-full rounded-r bg-accent"
                        style={{ width: `${(m.value / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs tabular-nums" title="本人">
                      {fmtCompact(m.value)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1">
                      <div
                        className="h-full rounded-r bg-deemph"
                        style={{ width: `${(m.avg / max) * 100}%` }}
                      />
                    </div>
                    <span
                      className="w-16 text-right text-xs text-muted tabular-nums"
                      title="同職業平均"
                    >
                      {fmtCompact(m.avg)}
                    </span>
                  </div>
                </div>
                <span
                  className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                    m.avg === 0 ? "text-muted" : diff >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {m.avg === 0 ? "—" : `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}%`}
                </span>
              </div>
            );
          })}
          <p className="mt-1 text-xs text-muted">
            上排（藍）為本人，下排（灰）為同職業平均；右側為相對差異。
          </p>
        </div>

        <h4 className="mb-3 mt-6 text-sm font-semibold text-ink2">
          與對方同職業平均比較（{opponentName} {player.cls}）
        </h4>
        {enemyClassmates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-baseline px-4 py-5 text-center text-sm text-muted">
            {opponentName} 沒有{player.cls}玩家，無法比較。
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            <SeriesLegend
              items={[
                { label: `${player.name}（本人）`, color: ownColor },
                {
                  label: `${opponentName} ${player.cls}平均（${enemyClassmates.length} 人）`,
                  color: oppColor,
                },
              ]}
            />
            {vsEnemy.map((m) => (
              <CompareRow
                key={m.key}
                label={m.label}
                a={m.value}
                b={m.avg}
                fmt={m.fmt}
                colors={[ownColor, oppColor]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
