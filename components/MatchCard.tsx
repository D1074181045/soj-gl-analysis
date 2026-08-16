"use client";

import { useState } from "react";
import Link from "next/link";
import type { MatchSummary } from "@/lib/types";
import {
  deleteMatchAction,
  disableShareAction,
  enableShareAction,
} from "@/lib/actions";
import { fmtDate } from "@/lib/format";

export default function MatchCard({ match }: { match: MatchSummary }) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    match.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${match.shareToken}`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-bdr bg-surface p-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/match/${match.id}`}
          className="font-medium hover:text-accent"
        >
          {match.title}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-ally" />
            {match.allyName}（{match.allyCount} 人）
          </span>
          <span className="text-muted">vs</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-enemy" />
            {match.enemyName}（{match.enemyCount} 人）
          </span>
        </p>
        <p className="mt-1 text-xs text-muted">{fmtDate(match.createdAt)} 上傳</p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/match/${match.id}`}
          className="rounded-md border border-bdr px-3 py-1.5 text-sm hover:bg-wash"
        >
          檢視
        </Link>

        {match.shareToken ? (
          <>
            <button
              onClick={async () => {
                if (!shareUrl) return;
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md border border-bdr px-3 py-1.5 text-sm hover:bg-wash cursor-pointer"
            >
              {copied ? "已複製！" : "複製分享連結"}
            </button>
            <form action={disableShareAction}>
              <input type="hidden" name="id" value={match.id} />
              <button className="rounded-md border border-bdr px-3 py-1.5 text-sm text-ink2 hover:bg-wash cursor-pointer">
                取消分享
              </button>
            </form>
          </>
        ) : (
          <form action={enableShareAction}>
            <input type="hidden" name="id" value={match.id} />
            <button className="rounded-md border border-bdr px-3 py-1.5 text-sm hover:bg-wash cursor-pointer">
              啟用分享
            </button>
          </form>
        )}

        <form
          action={deleteMatchAction}
          onSubmit={(e) => {
            if (!confirm(`確定要刪除「${match.title}」嗎？此動作無法復原。`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={match.id} />
          <button className="rounded-md border border-bdr px-3 py-1.5 text-sm text-bad hover:bg-wash cursor-pointer">
            刪除
          </button>
        </form>
      </div>
    </div>
  );
}
