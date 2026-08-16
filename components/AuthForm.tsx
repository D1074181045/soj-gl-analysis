"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ActionState } from "@/lib/actions";

interface Props {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  title: string;
  submitLabel: string;
  altText: string;
  altHref: string;
  altLinkLabel: string;
}

export default function AuthForm({
  action,
  title,
  submitLabel,
  altText,
  altHref,
  altLinkLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-bdr bg-surface p-8">
      <h1 className="mb-6 text-xl font-semibold">{title}</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          帳號
          <input
            name="username"
            required
            minLength={3}
            maxLength={20}
            autoComplete="username"
            className="rounded-md border border-bdr bg-page px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          密碼
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            className="rounded-md border border-bdr bg-page px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
        <button
          disabled={pending}
          className="mt-2 rounded-md bg-accent py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {pending ? "處理中…" : submitLabel}
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {altText}{" "}
        <Link href={altHref} className="text-accent hover:underline">
          {altLinkLabel}
        </Link>
      </p>
    </div>
  );
}
