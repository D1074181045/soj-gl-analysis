"use client";

import { useActionState } from "react";
import { uploadMatchAction } from "@/lib/actions";

export default function UploadForm() {
  const [state, formAction, pending] = useActionState(uploadMatchAction, {});
  return (
    <section className="rounded-xl border border-bdr bg-surface p-5">
      <h2 className="mb-3 font-semibold">上傳幫戰結算 CSV</h2>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-ink2">
          結算檔案（.csv）
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="rounded-md border border-bdr bg-page px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-wash file:px-2 file:py-1 file:text-ink2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink2">
          標題（可留空，預設為兩幫會名）
          <input
            name="title"
            maxLength={60}
            placeholder="例：第三週聯賽"
            className="w-64 rounded-md border border-bdr bg-page px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {pending ? "解析中…" : "上傳並檢視"}
        </button>
      </form>
      {state.error && <p className="mt-3 text-sm text-bad">{state.error}</p>}
    </section>
  );
}
