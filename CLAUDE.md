# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

逆水寒「幫會聯賽」結算 CSV 的視覺化 Web 應用。repo 根目錄放範例結算 CSV（檔名格式 `日期_時間_我方幫會_對方幫會.csv`），應用程式本體在 `webapp/`。功能：帳密註冊登入 → 上傳結算 CSV → 單場戰報視覺化（總覽對比／職業統計／玩家數據與詳情）→ 隨機連結分享（未登入可看）→ 玩家跨場比較。UI 全為繁體中文。

## 常用指令（皆在 `webapp/` 下執行）

```bash
npm run dev          # 開發伺服器
npm run build        # production build（同時做 TypeScript 型別檢查——本專案沒有獨立的 typecheck 指令）
npm start            # 跑 production build（port 3000）
npm run lint         # ESLint
```

沒有單元測試框架。驗證靠兩個腳本（需先 `npm start` 起伺服器）：

```bash
node scripts/seed-test.mjs   # 建 testuser/test123456 帳號、匯入根目錄兩個 CSV、開啟一場分享
                             # 輸出 JSON：{sessionToken, shareToken, firstMatchId}
node scripts/ui-test.mjs <shareToken>   # Playwright 驅動系統 Chrome (/usr/bin/google-chrome)
                                        # 跑完整 UI 流程並截圖到 /tmp/shots/
```

測試完把 testuser 刪掉（`DELETE FROM users WHERE username='testuser'`，FK cascade 會清掉附屬資料）。**使用者可能有真實帳號資料在 `data/app.db`，不要整檔刪除。**

重啟 production 伺服器的正確方式（`lsof -sTCP:LISTEN` 在此環境抓不到 next-server，殺不乾淨會 EADDRINUSE，舊伺服器配新 build 會出現 chunk 500）：

```bash
ss -tlnp | grep :3000 | grep -oP 'pid=\K[0-9]+' | xargs -r kill
```

Docker：`docker compose up -d --build`。本機 `~/.docker/config.json` 的 credsStore 指向不存在的 `docker-credential-desktop.exe`，build 前先 `export DOCKER_CONFIG=/tmp/docker-config`（放一個 `{}` 的 config.json）繞過。

## 架構

Next.js 16（App Router、Turbopack）+ TypeScript + Tailwind 4 + better-sqlite3 + Recharts。Next 16 慣例：`await cookies()`、`await props.params`、全域 `PageProps<'/route'>` 型別；`webapp/AGENTS.md`（由 `next dev` 自動產生，勿刪）提醒 API 可能與訓練資料不同，可查 `node_modules/next/dist/docs/`。

### 資料流

- **`lib/db.ts`**：better-sqlite3 單例（globalThis 快取避免 HMR/多 worker 重複開啟；WAL；schema 於載入時自動建立）。DB 在 `webapp/data/app.db`（gitignored）。`next.config.ts` 需保持 `serverExternalPackages: ["better-sqlite3"]` 與 `output: "standalone"`（Docker 用）。
- **`lib/parse.ts`**：結算 CSV 解析。格式：兩個幫會區塊，區塊開頭是 2 欄列（`"幫會名","人數"`），之後為 12 欄玩家列；逐行掃描辨識，不靠固定行號。編碼 UTF-8，出現替換字元時 fallback GB18030。
- **`lib/actions.ts`**（`"use server"`）：所有寫入操作——註冊/登入/登出、上傳、刪除、分享開關。每個動作都做 session 與場次擁有權檢查。表單用 `useActionState`，回傳 `{error?}`。
- **`lib/auth.ts`**：自建 session（`session` cookie ↔ sessions 資料表，bcryptjs 雜湊）。
- **`lib/data.ts`**：唯讀查詢，把 snake_case 資料列轉成 `lib/types.ts` 的 camelCase 型別。

### 路由

`/dashboard`（上傳＋場次列表＋分享控制）、`/match/[id]`（限擁有者）、`/share/[token]`（公開唯讀，同一個 `MatchView` 加 `shareBanner`）、`/players`（跨場比較）。未登入訪問受保護頁一律 `redirect("/login")`。

### UI 層

- **`components/MatchView.tsx`**：單場戰報主元件，三分頁（總覽／職業統計／玩家數據）。兩種 modal 可互相導覽：`ClassDetailModal`（職業詳情，含成員清單）→ 點成員開 `PlayerDetailModal`，關閉後回到職業詳情（靠 `selectedCls && !selectedPlayer` 條件渲染實現）。
- **`components/viz.tsx`**：共用視覺化元件（`CompareRow` 雙向對比條、`ContributionMeter` 佔比量表、`StatTile`、`SeriesLegend`、Recharts 自訂 tooltip）。

### 領域規則

- 欄位語意：**重傷 = 死亡次數**；KDA =（擊敗＋助攻）÷ max(重傷, 1)（`lib/format.ts` 的 `kdaOf`）。
- **職業專屬指標**（`lib/types.ts` 的 `metricAppliesToClass`）：化羽/清泉只屬於素問與潮光、焚骨只屬於九靈。任何顯示這兩個指標的新 UI 都必須套用此過濾。
- **配色是經過色盲驗證的固定規則**：我方＝藍 `var(--ally)`、對方＝橘 `var(--enemy)`（檢視對方視角的詳情時兩色互換，見 modal 內的 `ownColor`/`oppColor`）。設計 token 全在 `app/globals.css`（明暗雙模式，經 `@theme inline` 映射成 Tailwind 類別如 `bg-surface`、`text-ink`、`border-bdr`），新 UI 用這些 token，不要另外挑色。
- 大數值以 `fmtCompact` 壓縮（萬/億），完整值放 `title` 屬性；表格數字加 `tabular-nums`。
