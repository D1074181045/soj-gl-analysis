"use client";

import { useMemo, useState } from "react";
import type { PlayerStats } from "@/lib/types";
import { kdaOf } from "@/lib/format";

// 共用的表格排序狀態：點同一欄切換方向，換欄時用該欄預設方向
export function useSortable(defaultKey: string, defaultDesc = true) {
  const [key, setKey] = useState(defaultKey);
  const [desc, setDesc] = useState(defaultDesc);
  const toggle = (nextKey: string, numericDefaultDesc = true) => {
    if (key === nextKey) {
      setDesc((d) => !d);
    } else {
      setKey(nextKey);
      setDesc(numericDefaultDesc); // 數值欄預設由大到小，文字欄由小到大
    }
  };
  return { key, desc, toggle };
}

export function sortBy<T>(
  items: T[],
  valueOf: (item: T) => number | string,
  desc: boolean,
  tiebreak?: (a: T, b: T) => number
): T[] {
  return [...items].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    const cmp =
      typeof va === "string"
        ? va.localeCompare(String(vb), "zh-TW")
        : Number(va) - Number(vb);
    const signed = desc ? -cmp : cmp;
    return signed !== 0 || !tiebreak ? signed : tiebreak(a, b);
  });
}

// 玩家統計表共用的欄位取值（含 KDA 虛擬欄位）
export function playerSortValue(p: PlayerStats, key: string): number | string {
  if (key === "kda") return kdaOf(p.kills, p.deaths, p.assists);
  const v = p[key as keyof PlayerStats];
  return typeof v === "string" ? v : Number(v ?? 0);
}

export function SortTh({
  label,
  k,
  sort,
  numeric = true,
  last = false,
}: {
  label: string;
  k: string;
  sort: { key: string; desc: boolean; toggle: (k: string, numeric?: boolean) => void };
  numeric?: boolean;
  last?: boolean;
}) {
  return (
    <th
      className={`py-2 font-normal ${last ? "" : "pr-3"} ${
        numeric ? "text-right" : "text-left"
      }`}
    >
      <button
        onClick={() => sort.toggle(k, numeric)}
        className="cursor-pointer hover:text-ink"
      >
        {label}
        {sort.key === k && (sort.desc ? " ↓" : " ↑")}
      </button>
    </th>
  );
}

export function useSortedPlayers(players: PlayerStats[], defaultKey: string) {
  const sort = useSortable(defaultKey, true);
  const sorted = useMemo(
    () => sortBy(players, (p) => playerSortValue(p, sort.key), sort.desc),
    [players, sort.key, sort.desc]
  );
  return { sorted, sort };
}
