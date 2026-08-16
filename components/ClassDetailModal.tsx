"use client";

import { useEffect, useMemo } from "react";
import type { PlayerStats } from "@/lib/types";
import { fmtCompact, fmtInt, fmtKda } from "@/lib/format";
import { ContributionMeter, StatTile } from "./viz";

const SHARE_METRICS: { key: keyof PlayerStats; label: string }[] = [
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

function numOf(p: PlayerStats, key: keyof PlayerStats): number {
  return Number(p[key] ?? 0);
}

export default function ClassDetailModal({
  cls,
  team,
  guildName,
  sideLabel,
  onClose,
  onSelectPlayer,
}: {
  cls: string;
  team: PlayerStats[];
  guildName: string;
  sideLabel: "我方" | "對方";
  onClose: () => void;
  onSelectPlayer: (p: PlayerStats) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const members = useMemo(
    () =>
      [...team.filter((p) => p.cls === cls)].sort((a, b) => b.kills - a.kills),
    [team, cls]
  );

  const allClasses = useMemo(
    () => [...new Set(team.map((p) => p.cls))],
    [team]
  );

  // 該職業各指標的全隊佔比與職業間排名
  const shares = useMemo(() => {
    const totalOf = (players: PlayerStats[], key: keyof PlayerStats) =>
      players.reduce((s, p) => s + numOf(p, key), 0);
    return SHARE_METRICS.map(({ key, label }) => {
      const value = totalOf(members, key);
      const teamTotal = totalOf(team, key);
      const classTotals = allClasses.map((c) =>
        totalOf(team.filter((p) => p.cls === c), key)
      );
      const rank = classTotals.filter((t) => t > value).length + 1;
      return {
        key,
        label,
        value,
        ratio: teamTotal > 0 ? value / teamTotal : 0,
        rank,
        teamTotal,
      };
    }).filter((s) => s.teamTotal > 0);
  }, [members, team, allClasses]);

  const kills = members.reduce((s, p) => s + p.kills, 0);
  const deaths = members.reduce((s, p) => s + p.deaths, 0);
  const assists = members.reduce((s, p) => s + p.assists, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:py-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-bdr bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{cls}</h3>
            <p className="mt-0.5 text-sm text-ink2">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{
                    background: sideLabel === "我方" ? "var(--ally)" : "var(--enemy)",
                  }}
                />
                {guildName}（{sideLabel}）
              </span>
              ・共 {members.length} 人
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="人數" value={members.length} />
          <StatTile label="總擊敗" value={fmtInt(kills)} />
          <StatTile label="總重傷" value={fmtInt(deaths)} />
          <StatTile label="總助攻" value={fmtInt(assists)} />
          <StatTile
            label="職業 KDA"
            value={fmtKda(kills, deaths, assists)}
            sub="（擊敗＋助攻）÷ 重傷"
          />
        </div>

        <h4 className="mb-3 mt-6 text-sm font-semibold text-ink2">
          全隊貢獻佔比（{guildName}，排名為 {allClasses.length} 個職業間比較）
        </h4>
        <div className="flex flex-col gap-3.5">
          {shares.map((s) => (
            <ContributionMeter
              key={s.key}
              label={s.label}
              value={s.value}
              ratio={s.ratio}
              rank={s.rank}
              total={allClasses.length}
              fmt={fmtCompact}
            />
          ))}
        </div>

        <h4 className="mb-3 mt-6 text-sm font-semibold text-ink2">
          職業成員（依擊敗排序，點選可看個人詳情）
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bdr text-left text-xs text-muted">
                <th className="py-2 pr-3 font-normal">玩家</th>
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
              {members.map((p) => (
                <tr
                  key={p.id ?? p.name}
                  onClick={() => onSelectPlayer(p)}
                  className="cursor-pointer border-b border-grid hover:bg-wash"
                >
                  <td className="py-2 pr-3 font-medium">{p.name}</td>
                  <td className="py-2 pr-3 text-right">{fmtInt(p.kills)}</td>
                  <td className="py-2 pr-3 text-right">{fmtInt(p.deaths)}</td>
                  <td className="py-2 pr-3 text-right">{fmtInt(p.assists)}</td>
                  <td className="py-2 pr-3 text-right">
                    {fmtKda(p.kills, p.deaths, p.assists)}
                  </td>
                  <td className="py-2 pr-3 text-right" title={fmtInt(p.playerDamage)}>
                    {fmtCompact(p.playerDamage)}
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
      </div>
    </div>
  );
}
