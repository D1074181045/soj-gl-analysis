import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";

export const metadata: Metadata = {
  title: "幫會聯賽戰報",
  description: "逆水寒幫會聯賽結算視覺化",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-bdr bg-surface">
          <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
            <Link href={user ? "/dashboard" : "/login"} className="font-semibold">
              幫會聯賽戰報
            </Link>
            {user && (
              <>
                <Link
                  href="/dashboard"
                  className="text-sm text-ink2 hover:text-ink"
                >
                  我的場次
                </Link>
                <Link href="/teams" className="text-sm text-ink2 hover:text-ink">
                  陣容配置
                </Link>
                <Link
                  href="/players"
                  className="text-sm text-ink2 hover:text-ink"
                >
                  玩家跨場比較
                </Link>
              </>
            )}
            <div className="ml-auto flex items-center gap-4">
              {user ? (
                <>
                  <span className="text-sm text-muted">{user.username}</span>
                  <form action={logoutAction}>
                    <button className="text-sm text-ink2 hover:text-ink cursor-pointer">
                      登出
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-ink2 hover:text-ink">
                    登入
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
                  >
                    註冊
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
