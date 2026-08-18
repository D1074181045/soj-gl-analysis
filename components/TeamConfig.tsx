"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { MainTeam, RosterEntry, SubRole, TeamMap } from "@/lib/types";
import { MAIN_TEAMS, SUB_ROLES } from "@/lib/types";
import {
  clearTeamAssignmentAction,
  setTeamAssignmentAction,
} from "@/lib/actions";
import Dropdown from "./Dropdown";
import { sortBy, useSortable } from "./sortable";

type Filter = "all" | "unassigned" | MainTeam;

export default function TeamConfig({
  roster,
  initialAssignments,
}: {
  roster: RosterEntry[];
  initialAssignments: TeamMap;
}) {
  // 樂觀更新：先改本地狀態，背景送 server action
  const [assignments, setAssignments] = useState<TeamMap>(initialAssignments);
  const [filter, setFilter] = useState<Filter>("all");
  const [clsFilter, setClsFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const classes = useMemo(
    () => [...new Set(roster.map((r) => r.cls))].sort(),
    [roster]
  );

  const sort = useSortable("cls", false);
  const sorted = useMemo(
    () =>
      sortBy(
        roster,
        (r) =>
          sort.key === "name"
            ? r.name
            : sort.key === "matchCount"
              ? r.matchCount
              : r.cls,
        sort.desc,
        (a, b) => a.name.localeCompare(b.name, "zh-TW")
      ),
    [roster, sort.key, sort.desc]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { 進攻: 0, 機動: 0, 防守: 0, 未分團: 0 };
    for (const r of roster) {
      const a = assignments[r.name];
      if (a) c[a.mainTeam] += 1;
      else c["未分團"] += 1;
    }
    return c;
  }, [roster, assignments]);

  const visible = useMemo(() => {
    return sorted.filter((r) => {
      const a = assignments[r.name];
      if (filter === "unassigned" && a) return false;
      if (filter !== "all" && filter !== "unassigned" && a?.mainTeam !== filter)
        return false;
      if (clsFilter && r.cls !== clsFilter) return false;
      if (search.trim() && !r.name.includes(search.trim())) return false;
      return true;
    });
  }, [sorted, assignments, filter, clsFilter, search]);

  const setMain = (name: string, mainTeam: MainTeam) => {
    const prev = assignments[name];
    if (prev?.mainTeam === mainTeam) return; // 主團必選，不允許點擊取消
    const subRole = prev?.subRole ?? null;
    setAssignments((m) => ({ ...m, [name]: { mainTeam, subRole } }));
    setError(null);
    startTransition(async () => {
      const res = await setTeamAssignmentAction(name, mainTeam, subRole);
      if (res.error) setError(res.error);
    });
  };

  const setSub = (name: string, subRole: SubRole) => {
    const prev = assignments[name];
    if (!prev) return; // 副職需先有主團
    const next = prev.subRole === subRole ? null : subRole; // 再點一次取消
    setAssignments((m) => ({ ...m, [name]: { ...prev, subRole: next } }));
    setError(null);
    startTransition(async () => {
      const res = await setTeamAssignmentAction(name, prev.mainTeam, next);
      if (res.error) setError(res.error);
    });
  };

  const clear = (name: string) => {
    if (!assignments[name]) return;
    setAssignments((m) => {
      const next = { ...m };
      delete next[name];
      return next;
    });
    startTransition(async () => {
      await clearTeamAssignmentAction(name);
    });
  };

  if (roster.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-baseline p-8 text-center text-sm text-muted">
        尚無我方玩家名單，請先到
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
        <h1 className="text-xl font-semibold">陣容配置</h1>
        <p className="mt-1 text-sm text-ink2">
          名單彙整自你上傳過的所有場次（我方玩家）。主團為必選（進攻／機動／防守三選一）；副職可不選（保鑣／扛拆／空拆三選一，再點一次可取消）。設定會套用到所有場次的分團統計。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["all", `全部（${roster.length}）`],
            ["unassigned", `未分團（${counts["未分團"]}）`],
            ["進攻", `進攻（${counts["進攻"]}）`],
            ["機動", `機動（${counts["機動"]}）`],
            ["防守", `防守（${counts["防守"]}）`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs cursor-pointer ${
              filter === key
                ? "bg-accent text-white"
                : "border border-bdr text-ink2 hover:bg-wash"
            }`}
          >
            {label}
          </button>
        ))}
        <Dropdown
          value={clsFilter}
          onChange={setClsFilter}
          className="w-32"
          options={[
            { value: "", label: "全部職業" },
            ...classes.map((c) => ({ value: c, label: c })),
          ]}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋玩家名字…"
          className="w-40 rounded-md border border-bdr bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <span className="ml-auto text-xs text-muted">
          {isPending ? "儲存中…" : "變更會即時儲存"}
        </span>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-bdr bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bdr text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-normal">
                <button
                  onClick={() => sort.toggle("name", false)}
                  className="cursor-pointer hover:text-ink"
                >
                  玩家{sort.key === "name" && (sort.desc ? " ↓" : " ↑")}
                </button>
              </th>
              <th className="px-3 py-2.5 font-normal">
                <button
                  onClick={() => sort.toggle("cls", false)}
                  className="cursor-pointer hover:text-ink"
                >
                  職業{sort.key === "cls" && (sort.desc ? " ↓" : " ↑")}
                </button>
              </th>
              <th className="px-3 py-2.5 text-right font-normal">
                <button
                  onClick={() => sort.toggle("matchCount", true)}
                  className="cursor-pointer hover:text-ink"
                >
                  場次{sort.key === "matchCount" && (sort.desc ? " ↓" : " ↑")}
                </button>
              </th>
              <th className="px-3 py-2.5 font-normal">主團（必選）</th>
              <th className="px-3 py-2.5 font-normal">副職（可不選）</th>
              <th className="px-3 py-2.5 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const a = assignments[r.name];
              return (
                <tr key={r.name} className="border-b border-grid">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-ink2">{r.cls}</td>
                  <td className="px-3 py-2 text-right text-ink2 tabular-nums">
                    {r.matchCount}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {MAIN_TEAMS.map((t) => (
                        <button
                          key={t}
                          onClick={() => setMain(r.name, t)}
                          className={`rounded-md px-2.5 py-1 text-xs cursor-pointer ${
                            a?.mainTeam === t
                              ? "bg-accent text-white"
                              : "border border-bdr text-ink2 hover:bg-wash"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {SUB_ROLES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSub(r.name, s)}
                          disabled={!a}
                          title={a ? undefined : "請先選擇主團"}
                          className={`rounded-md px-2.5 py-1 text-xs ${
                            a?.subRole === s
                              ? "bg-accent text-white cursor-pointer"
                              : a
                                ? "border border-bdr text-ink2 hover:bg-wash cursor-pointer"
                                : "border border-bdr text-muted opacity-50 cursor-not-allowed"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {a && (
                      <button
                        onClick={() => clear(r.name)}
                        className="text-xs text-muted hover:text-bad cursor-pointer"
                        title="清除此玩家的分團設定"
                      >
                        清除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  沒有符合條件的玩家
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
