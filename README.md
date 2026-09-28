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
- **不可枚舉的場次網址**：場次對外一律使用 128-bit 隨機 id（`/match/<22 字元>`），資料庫內部的自增編號不會出現在網址、表單或任何回應中；猜不到、也無法從自己的場次推算別人的
- **陣容配置與分團分析**：主團與副職清單皆可自行新增／改名／刪除（預設進攻／機動／防守與保鑣／扛拆／空拆），再把我方玩家分到各團（主團必選單選；副職可不選）；戰報多出「分團分析」分頁：只列出本場有成員的分團，卡片顯示各團彙總、點選展開成員表，另有各團對比圖；玩家詳情可看本團貢獻佔比與跨團對比（化羽清泉／焚骨只與同職業比）。配置以玩家名字為鍵，跨場次共用；另可在單場戰報內「調整本場分團」做該場專屬覆寫（優先級：本場調整 > 統一配置，可隨時還原）
- **玩家跨場比較**：搜尋任一玩家，查看其在各場次的表現趨勢與明細
- 繁體中文介面、明暗雙主題（跟隨系統設定）、色盲友善配色（我方藍／對方橘）

首次點選某場的「調整本場分團」時，會依玩家名字帶入此帳號最近儲存的本場分團配置（含副職）。本場已有調整的玩家保留原設定，沒有歷史配置的玩家沿用統一配置。每位玩家都可點「使用統一配置」切回，重新開啟或重新整理後也會保留此選擇。載入與修改皆即時儲存；只瀏覽戰報或分享頁不會載入歷史配置。舊資料沒有調整時間時，以場次上傳時間及順序判斷最近配置。

## 技術棧

Next.js 16（App Router、Server Actions）・TypeScript・Tailwind CSS 4・Kysely（SQLite／MySQL／PostgreSQL）・Recharts

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

預設使用 SQLite 單一檔案，首次啟動自動建立於 `data/app.db`（已 gitignore），無需任何設定。

### 切換資料庫（SQLite／MySQL／PostgreSQL）

同一份程式碼透過環境變數切換資料庫，資料表會在首次啟動時自動建立（可參考 `.env.example`）：

| 資料庫 | `DB_DIALECT` | `DATABASE_URL` |
|---|---|---|
| SQLite（預設） | `sqlite` | 可省略；或指定檔案路徑如 `./data/app.db` |
| MySQL 8 / MariaDB | `mysql` | `mysql://user:password@host:3306/dbname` |
| PostgreSQL | `postgres` | `postgres://user:password@host:5432/dbname` |

```bash
DB_DIALECT=postgres DATABASE_URL=postgres://app:app@localhost:5432/app npm start
```

- MySQL 請以 `utf8mb4` 建立資料庫（中文玩家名稱、表情符號才不會亂碼）
- 三種資料庫的 schema 完全相同，但**不會自動搬移既有資料**；換資料庫等於從空資料庫開始

### Docker

```bash
docker compose up -d --build
```

- 服務跑在 `http://localhost:3001`
- 預設 SQLite，資料庫持久化於 named volume `app-data`；想直接對應主機目錄，將 `docker-compose.yml` 的 volume 改為 `./data:/app/data`
- 要改用 MySQL／PostgreSQL：在 `.env` 設定 `DB_DIALECT` 與 `DATABASE_URL`，並解開 `docker-compose.yml` 內對應的 `db` 服務範例註解
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
# 建立 testuser/test123456、匯入 repo 根目錄的範例 CSV、開啟一場分享（依 DB_DIALECT/DATABASE_URL 連線）
# 輸出 {sessionToken, shareToken, firstMatchId}

node scripts/ui-test.mjs <shareToken>
# Playwright 驅動系統 Chrome 跑完整 UI 流程（登入→戰報三分頁→玩家詳情→跨場比較→分享頁）
# 截圖輸出到 /tmp/shots/

node scripts/team-defaults-test.mjs
# 需先 npm run build；自動啟動獨立伺服器與暫存 SQLite，驗證歷史分團載入、統一配置、帳號隔離與舊 schema 升級
```

同一份分團測試也支援 MySQL／PostgreSQL，共用已完成的 production build。`TEST_DATABASE_URL` 必須指向**空的測試資料庫**；腳本會拒絕已有資料表的資料庫。可用 Docker 建立每次測試專用的資料庫：

```bash
docker run -d --rm --name team-test-mysql -p 127.0.0.1:33070:3306 \
  -e MYSQL_ROOT_PASSWORD=testroot -e MYSQL_USER=app -e MYSQL_PASSWORD=app -e MYSQL_DATABASE=team_test \
  mysql:8 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
docker run -d --rm --name team-test-postgres -p 127.0.0.1:54370:5432 \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=team_test postgres:16-alpine

# 等兩個資料庫啟動完成後執行
DB_DIALECT=mysql TEST_DATABASE_URL=mysql://app:app@127.0.0.1:33070/team_test node scripts/team-defaults-test.mjs
DB_DIALECT=postgres TEST_DATABASE_URL=postgres://app:app@127.0.0.1:54370/team_test node scripts/team-defaults-test.mjs

# 清除本次測試容器及其資料；下次測試重新建立空容器
docker stop team-test-mysql team-test-postgres
```

執行 `seed-test.mjs` 驗證後可刪除測試帳號：`DELETE FROM users WHERE username='testuser'`（外鍵 cascade 會一併清除其場次資料）。

## 專案結構

```
app/            路由（dashboard、match/[id]、share/[token]、players、login、register）
components/     UI 元件（MatchView 戰報主元件、兩種詳情 modal、共用視覺化元件）
lib/            db（Kysely 連線＋跨方言 schema）、parse（CSV 解析）、actions（Server Actions）、
                auth（session）、data（查詢）、types、format
scripts/        seed-test / ui-test 驗證腳本
data/           SQLite 資料庫（預設方言時自動建立，gitignored）
```

更完整的架構說明見 repo 根目錄的 `CLAUDE.md`。
