"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { RosterEntry, TeamMap, UserSubRole, UserTeam } from "@/lib/types";
import { UNASSIGNED_LABEL } from "@/lib/types";
import {
  addSubRoleAction,
  addTeamAction,
  clearTeamAssignmentAction,
  deleteSubRoleAction,
  deleteTeamAction,
  renameSubRoleAction,
  renameTeamAction,
  setTeamAssignmentAction,
} from "@/lib/actions";
import Dropdown from "./Dropdown";
import { sortBy, useSortable } from "./sortable";

// 篩選：null＝全部、""＝未分團、其他＝主團名稱
type Filter = string | null;

interface NamedItem {
  id: number;
  name: string;
}
interface ListResult {
  error?: string;
  items?: NamedItem[];
}

export default function TeamConfig({
  roster,
  initialAssignments,
  initialTeams,
  initialSubRoles,
}: {
  roster: RosterEntry[];
  initialAssignments: TeamMap;
  initialTeams: UserTeam[];
  initialSubRoles: UserSubRole[];
}) {
  // 樂觀更新：先改本地狀態，背景送 server action
  const [assignments, setAssignments] = useState<TeamMap>(initialAssignments);
  const [userTeams, setUserTeams] = useState<UserTeam[]>(initialTeams);
  const [userSubRoles, setUserSubRoles] = useState<UserSubRole[]>(initialSubRoles);
  const [filter, setFilter] = useState<Filter>(null);
  const [clsFilter, setClsFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const teamNames = useMemo(() => userTeams.map((t) => t.name), [userTeams]);
  const subRoleNames = useMemo(() => userSubRoles.map((s) => s.name), [userSubRoles]);

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
    const c: Record<string, number> = {};
    for (const n of teamNames) c[n] = 0;
    c[UNASSIGNED_LABEL] = 0;
    for (const r of roster) {
      const a = assignments[r.name];
      if (a && a.mainTeam in c) c[a.mainTeam] += 1;
      else c[UNASSIGNED_LABEL] += 1;
    }
    return c;
  }, [roster, assignments, teamNames]);

  const subCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of subRoleNames) c[n] = 0;
    for (const r of roster) {
      const s = assignments[r.name]?.subRole;
      if (s && s in c) c[s] += 1;
    }
    return c;
  }, [roster, assignments, subRoleNames]);

  const visible = useMemo(() => {
    return sorted.filter((r) => {
      const a = assignments[r.name];
      if (filter === "" && a) return false;
      if (filter !== null && filter !== "" && a?.mainTeam !== filter) return false;
      if (clsFilter && r.cls !== clsFilter) return false;
      if (search.trim() && !r.name.includes(search.trim())) return false;
      return true;
    });
  }, [sorted, assignments, filter, clsFilter, search]);

  // ===== 玩家分團 =====
  const setMain = (name: string, mainTeam: string) => {
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

  const setSub = (name: string, subRole: string) => {
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

  const filterChips: [Filter, string][] = [
    [null, `全部（${roster.length}）`],
    ["", `${UNASSIGNED_LABEL}（${counts[UNASSIGNED_LABEL]}）`],
    ...teamNames.map((n): [Filter, string] => [n, `${n}（${counts[n]}）`]),
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">陣容配置</h1>
        <p className="mt-1 text-sm text-ink2">
          先建立主團與副職，再把我方玩家分到各團。主團必選、單選；副職可不選、選則單選（再點一次可取消）。設定會套用到所有場次的分團分析，也可在單場戰報內另做本場調整。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <NameListEditor
          title="主團管理"
          hint="點名稱可改名，改名會同步更新所有已分配的玩家"
          placeholder="新主團名稱"
          items={userTeams}
          counts={counts}
          add={async (n) => {
            const r = await addTeamAction(n);
            return { error: r.error, items: r.teams };
          }}
          rename={async (id, n) => {
            const r = await renameTeamAction(id, n);
            return { error: r.error, items: r.teams };
          }}
          remove={async (id) => {
            const r = await deleteTeamAction(id);
            return { error: r.error, items: r.teams };
          }}
          confirmDelete={(item) => {
            const n = counts[item.name] ?? 0;
            return (
              `確定刪除主團「${item.name}」？` +
              (n > 0
                ? `\n已分到此團的 ${n} 位玩家（含各場的本場調整）將變為未分團。`
                : "")
            );
          }}
          onItems={(items) => setUserTeams(items)}
          onRenamed={(oldName, newName) => {
            setAssignments((m) =>
              Object.fromEntries(
                Object.entries(m).map(([k, a]) => [
                  k,
                  a.mainTeam === oldName ? { ...a, mainTeam: newName } : a,
                ])
              )
            );
            if (filter === oldName) setFilter(newName);
          }}
          onDeleted={(name) => {
            setAssignments((m) => {
              const next = { ...m };
              for (const [k, a] of Object.entries(next)) {
                if (a.mainTeam === name) delete next[k];
              }
              return next;
            });
            if (filter === name) setFilter(null);
          }}
        />
        <NameListEditor
          title="副職管理"
          hint="副職為選填，刪除後引用它的玩家改為無副職"
          placeholder="新副職名稱"
          items={userSubRoles}
          counts={subCounts}
          add={async (n) => {
            const r = await addSubRoleAction(n);
            return { error: r.error, items: r.subRoles };
          }}
          rename={async (id, n) => {
            const r = await renameSubRoleAction(id, n);
            return { error: r.error, items: r.subRoles };
          }}
          remove={async (id) => {
            const r = await deleteSubRoleAction(id);
            return { error: r.error, items: r.subRoles };
          }}
          confirmDelete={(item) => {
            const n = subCounts[item.name] ?? 0;
            return (
              `確定刪除副職「${item.name}」？` +
              (n > 0 ? `\n引用此副職的 ${n} 位玩家將改為無副職（主團不變）。` : "")
            );
          }}
          onItems={(items) => setUserSubRoles(items)}
          onRenamed={(oldName, newName) => {
            setAssignments((m) =>
              Object.fromEntries(
                Object.entries(m).map(([k, a]) => [
                  k,
                  a.subRole === oldName ? { ...a, subRole: newName } : a,
                ])
              )
            );
          }}
          onDeleted={(name) => {
            setAssignments((m) =>
              Object.fromEntries(
                Object.entries(m).map(([k, a]) => [
                  k,
                  a.subRole === name ? { ...a, subRole: null } : a,
                ])
              )
            );
          }}
        />
      </div>

      {roster.length === 0 ? (
        <p className="rounded-xl border border-dashed border-baseline p-8 text-center text-sm text-muted">
          尚無我方玩家名單，請先到
          <Link href="/dashboard" className="mx-1 text-accent hover:underline">
            我的場次
          </Link>
          上傳幫戰結算 CSV。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {filterChips.map(([key, label], i) => (
              <button
                key={i}
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
                        {teamNames.length === 0 ? (
                          <span className="text-xs text-muted">請先在上方新增主團</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {teamNames.map((t) => (
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
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {subRoleNames.length === 0 ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {subRoleNames.map((s) => (
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
                        )}
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
        </>
      )}
    </div>
  );
}

// 名稱清單管理（主團／副職共用）：新增、點名稱改名、刪除
function NameListEditor({
  title,
  hint,
  placeholder,
  items,
  counts,
  add,
  rename,
  remove,
  confirmDelete,
  onItems,
  onRenamed,
  onDeleted,
}: {
  title: string;
  hint: string;
  placeholder: string;
  items: NamedItem[];
  counts: Record<string, number>;
  add: (name: string) => Promise<ListResult>;
  rename: (id: number, name: string) => Promise<ListResult>;
  remove: (id: number) => Promise<ListResult>;
  confirmDelete: (item: NamedItem) => string;
  onItems: (items: NamedItem[]) => void;
  onRenamed?: (oldName: string, newName: string) => void;
  onDeleted?: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cancelRef = useRef(false);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await add(name);
      if (res.error) setError(res.error);
      else if (res.items) {
        onItems(res.items);
        setNewName("");
      }
    });
  };

  const commitRename = (item: NamedItem) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name || name === item.name) return;
    setError(null);
    startTransition(async () => {
      const res = await rename(item.id, name);
      if (res.error) setError(res.error);
      else if (res.items) {
        onItems(res.items);
        onRenamed?.(item.name, name);
      }
    });
  };

  const handleDelete = (item: NamedItem) => {
    if (!confirm(confirmDelete(item))) return;
    setError(null);
    startTransition(async () => {
      const res = await remove(item.id);
      if (res.error) setError(res.error);
      else if (res.items) {
        onItems(res.items);
        onDeleted?.(item.name);
      }
    });
  };

  return (
    <section className="rounded-xl border border-bdr bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-muted">
          {items.length} 個・{hint}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-bdr bg-page px-2 py-1 text-sm"
          >
            {editingId === item.id ? (
              <input
                autoFocus
                value={editingName}
                maxLength={12}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    cancelRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (cancelRef.current) {
                    cancelRef.current = false;
                    setEditingId(null);
                    return;
                  }
                  commitRename(item);
                }}
                className="w-24 rounded border border-bdr bg-surface px-1.5 py-0.5 text-sm outline-none focus:border-accent"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingId(item.id);
                  setEditingName(item.name);
                }}
                title="點擊改名"
                className="cursor-pointer hover:text-accent"
              >
                {item.name}
              </button>
            )}
            <span className="text-xs text-muted">{counts[item.name] ?? 0} 人</span>
            <button
              onClick={() => handleDelete(item)}
              aria-label={`刪除 ${item.name}`}
              title="刪除"
              className="ml-0.5 text-muted hover:text-bad cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="inline-flex items-center gap-1.5"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={placeholder}
            maxLength={12}
            className="w-32 rounded-md border border-bdr bg-page px-2.5 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName.trim() || isPending}
            className="rounded-md bg-accent px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            新增
          </button>
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
