# 幫會聯賽戰報

逆水寒「幫會聯賽」結算 CSV 的視覺化 Web 應用。上傳遊戲匯出的結算檔，即可瀏覽單場戰報的完整視覺化分析，並以連結分享給幫會成員（無需登入）。

## 功能

- **帳號系統**：帳密註冊／登入（bcrypt 雜湊、session cookie）
- **上傳結算 CSV**：自動解析雙方幫會與所有玩家數據，可自訂場次標題
- **單場戰報**（三個分頁）
  - **總覽**：雙方 KDA、總傷害等 stat tiles，八項全隊數據對比長條圖、職業構成
  - **職業統計**：可切換指標的各職業平均對比圖（雙方並列）＋職業平均一覽表
  - **玩家數據**：可排序／篩選職業／搜尋的玩家表格
- **職業詳情**：職業彙總、佔全隊比例與職業間排名、與對方同職業的平均對比、成員清單（素問／潮光多顯示化羽清泉、九靈多顯示焚骨）
- **玩家詳情**：個人 KDA、各項數據佔全隊比例與隊內排名、與同職業平均及對方同職業平均的對比長條圖
- **分享連結**：每場可產生隨機網址（`/share/<token>`），未登入者可看唯讀戰報，可隨時取消
- **陣容配置與分團統計**：把我方玩家分到進攻／機動／防守團（必選三選一），可加保鑣／扛拆／空拆副職（可不選，選則三選一）；戰報多出「分團統計」分頁（各團彙總、對比圖、成員表），玩家詳情可看本團貢獻佔比與跨團輸出對比。配置以玩家名字為鍵，跨場次共用
- **玩家跨場比較**：搜尋任一玩家，查看其在各場次的表現趨勢與明細
- 繁體中文介面、明暗雙主題（跟隨系統設定）、色盲友善配色（我方藍／對方橘）

## 技術棧

Next.js 16（App Router、Server Actions）・TypeScript・Tailwind CSS 4・better-sqlite3・Recharts

## 快速開始

需求：Node.js 22+

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:3000
```

Production：

```bash
npm run build      # 建置（含 TypeScript 型別檢查）
npm start          # http://localhost:3000
```

資料庫為 SQLite 單一檔案，首次啟動自動建立於 `data/app.db`（已 gitignore），無需任何設定。

### Docker

```bash
docker compose up -d --build
```

- 服務跑在 `http://localhost:3000`
- 資料庫持久化於 named volume `app-data`；想直接對應主機目錄，將 `docker-compose.yml` 的 volume 改為 `./data:/app/data`
- 映像為多階段建置（standalone 輸出），以非 root 使用者執行，內建 healthcheck

## 結算 CSV 格式

遊戲匯出的結算檔為兩個幫會區塊，各自以「幫會名＋人數」列開頭，接著是欄位標題與每位玩家一列：

```csv
"我方幫會名","60"
"玩家名字","職業","擊敗","助攻","資源","對玩家傷害","對建築傷害","治療值","承受傷害","重傷","化羽/清泉","焚骨"
"玩家A","九靈","56","270","0","67991743","305843","4000","12850717","3","0","113"
...
"對方幫會名","56"
"玩家名字","職業",...
...
```

解析採逐行辨識（不依賴固定行號），編碼支援 UTF-8 與 GB18030。欄位語意：**重傷＝死亡次數**，KDA＝（擊敗＋助攻）÷ max(重傷, 1)。

## 開發驗證

本專案沒有單元測試，以兩個腳本做端對端驗證（需先起好伺服器）：

```bash
node scripts/seed-test.mjs
# 建立 testuser/test123456、匯入 repo 根目錄的範例 CSV、開啟一場分享
# 輸出 {sessionToken, shareToken, firstMatchId}

node scripts/ui-test.mjs <shareToken>
# Playwright 驅動系統 Chrome 跑完整 UI 流程（登入→戰報三分頁→玩家詳情→跨場比較→分享頁）
# 截圖輸出到 /tmp/shots/
```

驗證完可刪除測試帳號：`DELETE FROM users WHERE username='testuser'`（外鍵 cascade 會一併清除其場次資料）。

## 專案結構

```
app/            路由（dashboard、match/[id]、share/[token]、players、login、register）
components/     UI 元件（MatchView 戰報主元件、兩種詳情 modal、共用視覺化元件）
lib/            db（SQLite 單例）、parse（CSV 解析）、actions（Server Actions）、
                auth（session）、data（查詢）、types、format
scripts/        seed-test / ui-test 驗證腳本
data/           SQLite 資料庫（自動建立，gitignored）
```

更完整的架構說明見 repo 根目錄的 `CLAUDE.md`。
