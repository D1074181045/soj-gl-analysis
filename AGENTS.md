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

`/dashboard`（上傳＋場次列表＋分享控制）、`/match/[id]`（限擁有者）、`/share/[token]`（公開唯讀，同一個 `MatchView` 加 `shareBanner`）、`/players`（跨場比較）、`/teams`（陣容配置：管理主團／副職清單＋把我方玩家分到各團）。未登入訪問受保護頁一律 `redirect("/login")`。

### UI 層

- **`components/MatchView.tsx`**：單場戰報主元件，四分頁（總覽／職業統計／玩家數據／分團分析）。分團分析只列出本場有成員的分團（依使用者清單順序，未分團附在最後），卡片可點選展開該團成員表（一次一團），含「調整本場分團」編輯模式（僅擁有者，優先級：本場調整 > 統一配置）。兩種 modal 可互相導覽：`ClassDetailModal`（職業詳情，含成員清單）→ 點成員開 `PlayerDetailModal`，關閉後回到職業詳情（靠 `selectedCls && !selectedPlayer` 條件渲染實現）。
- **`components/viz.tsx`**：共用視覺化元件（`CompareRow` 雙向對比條、`ContributionMeter` 佔比量表、`StatTile`、`SeriesLegend`、Recharts 自訂 tooltip）。
- **`components/sortable.tsx`**：表格排序共用件（`useSortable`／`useSortedPlayers` hook、`SortTh` 標頭、`playerSortValue` 含 KDA 虛擬欄位）。**所有玩家列表都要可點欄位排序**（玩家數據、各團成員表、職業詳情成員表、陣容配置、本場調整表皆已套用）；數值欄預設由大到小、文字欄由小到大。

### 領域規則

- 欄位語意：**重傷 = 死亡次數**；KDA =（擊敗＋助攻）÷ max(重傷, 1)（`lib/format.ts` 的 `kdaOf`）。
- **職業專屬指標**（`lib/types.ts` 的 `metricAppliesToClass`）：化羽/清泉只屬於素問與潮光、焚骨只屬於九靈。顯示位置規則：**同職業比較**（與同職業平均、與對方同職業平均）、**本團貢獻**、**與各團對比**與職業/成員表格要依職業顯示；只有**全隊貢獻佔比**不顯示這兩個指標（全隊跨職業佔比無意義）。在本團貢獻與各團對比中，這兩個指標的比較對象**只算該團同職業成員**（焚骨只跟本團九靈比、化羽/清泉只跟本團同為素問或同為潮光的人比），佔比分母與「第 x/y 名」的 y 都用同職業人數。
- **分團**（以「使用者＋玩家名字」為鍵、跨場次共用的 `team_assignments`，加上以「場次＋玩家名字」為鍵的單場覆寫 `match_team_assignments`，**優先級：本場調整 > 統一陣容配置**，合併在 `MatchView` 的 `effectiveTeams`）：**主團與副職都是使用者自訂清單**（`user_teams`／`user_sub_roles`，註冊時種入預設進攻/機動/防守與保鑣/扛拆/空拆；既有帳號由 `lib/db.ts` 的 `runOnce` 一次性遷移補上，`schema_meta` 記錄已跑過）。主團必選單選、副職可不選；server action 以清單驗證。改名會連動 `team_assignments`／`match_team_assignments`；刪主團會清掉引用者的分團，刪副職只把引用者設為無副職。`UNASSIGNED_LABEL`（未分團）是保留名；顯示用 `teamLabel()` 在名稱未以團/隊/組結尾時補「團」。統一配置在 `/teams`（`TeamConfig` 內的 `NameListEditor` 同時管兩份清單），單場調整在戰報「分團分析」分頁的編輯模式（僅擁有者）。戰報分團分頁與玩家詳情的團隊區塊都是用名字 join；分享頁由場次反查擁有者設定與清單（`getTeamAssignmentsByMatch`／`getUserTeamsByMatch`／`getUserSubRolesByMatch`）再疊上該場覆寫。
- **配色是經過色盲驗證的固定規則**：我方＝藍 `var(--ally)`、對方＝橘 `var(--enemy)`（檢視對方視角的詳情時兩色互換，見 modal 內的 `ownColor`/`oppColor`）。設計 token 全在 `app/globals.css`（明暗雙模式，經 `@theme inline` 映射成 Tailwind 類別如 `bg-surface`、`text-ink`、`border-bdr`），新 UI 用這些 token，不要另外挑色。
- 大數值以 `fmtCompact` 壓縮（萬/億），完整值放 `title` 屬性；表格數字加 `tabular-nums`。
