// npm run build && node scripts/team-defaults-test.mjs
// MySQL / PostgreSQL：DB_DIALECT=mysql|postgres TEST_DATABASE_URL=... node scripts/team-defaults-test.mjs
// TEST_DATABASE_URL 必須指向空的測試資料庫；SQLite 一律使用暫存檔。
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, sql } from "kysely";
import { createPool } from "mysql2";
import pg from "pg";
import { chromium } from "playwright";

const dialect = process.env.DB_DIALECT ?? "sqlite";
assert.ok(["sqlite", "mysql", "postgres"].includes(dialect), "不支援的 DB_DIALECT");
if (dialect !== "sqlite") assert.ok(process.env.TEST_DATABASE_URL, "請設定空測試資料庫的 TEST_DATABASE_URL");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-defaults-"));
const databaseUrl = dialect === "sqlite" ? path.join(dir, "app.db") : process.env.TEST_DATABASE_URL;
function createDb() {
  if (dialect === "mysql") return new Kysely({ dialect: new MysqlDialect({ pool: createPool({ uri: databaseUrl }) }) });
  if (dialect === "postgres") return new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl }) }) });
  const sqlite = new Database(databaseUrl);
  sqlite.pragma("foreign_keys = ON");
  return new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
}
const db = createDb();
let server;
let logs = "";
let browser;

async function insertId(table, values) {
  const query = db.insertInto(table).values(values);
  if (dialect === "postgres") return Number((await query.returning("id").executeTakeFirstOrThrow()).id);
  return Number((await query.executeTakeFirstOrThrow()).insertId);
}
async function addMatch(owner, title, createdAt) {
  const publicId = crypto.randomBytes(16).toString("base64url");
  const id = await insertId("matches", {
    public_id: publicId, user_id: owner, title, ally_name: "我方", ally_count: 6,
    enemy_name: "對方", enemy_count: 1, created_at: createdAt,
  });
  return { id, publicId };
}
async function addOverride(matchId, playerName, mainTeam, subRole, updatedAt) {
  await db.insertInto("match_team_assignments").values({
    match_id: matchId, player_name: playerName, main_team: mainTeam, sub_role: subRole,
    ...(updatedAt === undefined ? {} : { updated_at: updatedAt }),
  }).execute();
}

const port = 32000 + crypto.randomInt(20000);
const base = `http://127.0.0.1:${port}`;
try {
  assert.equal((await db.introspection.getTables()).length, 0, "只允許使用空的測試資料庫");
  // 預先建立舊版資料表，讓伺服器實際走欄位遷移並保留既有資料。
  const keyType = dialect === "mysql" ? "varchar(191)" : "text";
  const timestampType = dialect === "postgres" ? "timestamptz" : dialect === "mysql" ? "datetime" : "text";
  const pkType = dialect === "postgres" ? "serial" : "integer";
  const pk = (c) => dialect === "postgres" ? c.primaryKey() : c.primaryKey().autoIncrement();
  await db.schema.createTable("users")
    .addColumn("id", pkType, pk)
    .addColumn("username", keyType, (c) => c.notNull().unique())
    .addColumn("password_hash", "text", (c) => c.notNull())
    .addColumn("created_at", timestampType, (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createTable("matches")
    .addColumn("id", pkType, pk)
    .addColumn("public_id", keyType, (c) => c.notNull().unique())
    .addColumn("user_id", "integer", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("title", "text", (c) => c.notNull())
    .addColumn("ally_name", "text", (c) => c.notNull())
    .addColumn("ally_count", "integer", (c) => c.notNull())
    .addColumn("enemy_name", "text", (c) => c.notNull())
    .addColumn("enemy_count", "integer", (c) => c.notNull())
    .addColumn("share_token", keyType, (c) => c.unique())
    .addColumn("created_at", timestampType, (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createTable("match_team_assignments")
    .addColumn("match_id", "integer", (c) => c.notNull().references("matches.id").onDelete("cascade"))
    .addColumn("player_name", keyType, (c) => c.notNull())
    .addColumn("main_team", "text", (c) => c.notNull())
    .addColumn("sub_role", "text")
    .addPrimaryKeyConstraint("pk_match_team_assignments", ["match_id", "player_name"])
    .execute();
  const userId = await insertId("users", { username: "team-test", password_hash: "unused" });
  const otherUserId = await insertId("users", { username: "other-team-test", password_hash: "unused" });
  const old = await addMatch(userId, "較早場次", "2025-01-01 00:00:00");
  const newer = await addMatch(userId, "較新場次", "2025-02-01 00:00:00");
  const current = await addMatch(userId, "本場", "2025-03-01 00:00:00");
  const next = await addMatch(userId, "下場", "2025-04-01 00:00:00");
  const empty = await addMatch(userId, "無統一配置", "2025-05-01 00:00:00");
  const foreign = await addMatch(otherUserId, "另一帳號", "2025-06-01 00:00:00");
  await addOverride(old.id, "舊資料玩家", "進攻", "保鑣");
  await addOverride(newer.id, "舊資料玩家", "防守", null);
  await addOverride(current.id, "本場已調整", "機動", "空拆");

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DB_DIALECT: dialect, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server stopped: ${logs}`);
    try {
      ready = (await fetch(`${base}/login`)).ok;
    } catch { /* 等伺服器監聽 */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Server did not start: ${logs}`);
  const tables = await db.introspection.getTables();
  assert.ok(tables.find((t) => t.name === "matches").columns.some((c) => c.name === "team_defaults_loaded"));
  assert.ok(tables.find((t) => t.name === "match_team_assignments").columns.some((c) => c.name === "updated_at"));
  assert.equal((await db.selectFrom("match_team_assignments").selectAll().execute()).length, 3);
  console.log(`PASS [${dialect}]: 舊 schema 遷移並保留既有配置`);

  const sessionToken = crypto.randomBytes(32).toString("hex");
  await db.insertInto("sessions").values({ token: sessionToken, user_id: userId, expires_at: Date.now() + 3600000 }).execute();
  const names = ["歷史玩家", "本場已調整", "統一玩家", "未分團玩家", "舊資料玩家", "他人同名"];
  const addPlayer = (matchId, side, name) => db.insertInto("players").values({
    match_id: matchId, side, name, cls: "素問", kills: 1, assists: 2, resources: 0,
    player_damage: 100, building_damage: 0, healing: 200, damage_taken: 50, deaths: 1, purify: 0, burn: 0,
  }).execute();
  for (const match of [old, newer, current, next]) {
    for (const name of names) await addPlayer(match.id, 0, name);
    await addPlayer(match.id, 1, "對方限定");
  }
  await addPlayer(empty.id, 0, "無統一歷史");
  await addPlayer(empty.id, 1, "對方限定");
  for (const name of names.filter((n) => n !== "未分團玩家")) {
    await db.insertInto("team_assignments").values({ user_id: userId, player_name: name, main_team: "進攻", sub_role: "保鑣" }).execute();
  }
  // 較早場次最後儲存的時間較新，應優先於較新場次；副職 null 也必須完整沿用。
  await addOverride(old.id, "歷史玩家", "防守", null, 300);
  await addOverride(newer.id, "歷史玩家", "機動", "扛拆", 200);
  await addOverride(old.id, "本場已調整", "防守", "保鑣", 300);
  await addOverride(old.id, "未分團玩家", "防守", "扛拆", 300);
  await addOverride(old.id, "無統一歷史", "機動", "空拆", 300);
  await addOverride(old.id, "對方限定", "防守", null, 300);
  await addOverride(foreign.id, "歷史玩家", "機動", "空拆", 999999);
  await addOverride(foreign.id, "他人同名", "機動", "空拆", 999999);
  const shareToken = crypto.randomBytes(16).toString("base64url");
  await db.updateTable("matches").set({ share_token: shareToken }).where("id", "=", current.id).execute();
  const currentRows = () => db.selectFrom("match_team_assignments").selectAll().where("match_id", "=", current.id).execute();
  const savedHistory = () => db.selectFrom("match_team_assignments").selectAll()
    .where("match_id", "=", current.id).where("player_name", "=", "歷史玩家").executeTakeFirstOrThrow();

  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  await context.addCookies([{ name: "session", value: sessionToken, url: base }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const editor = page.locator("section").filter({ has: page.getByRole("heading", { name: "本場分團調整" }) });
  const row = (name) => editor.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
  async function visit(match) {
    await page.goto(`${base}/match/${match.publicId}`);
    await page.getByRole("button", { name: "分團分析", exact: true }).click();
  }
  async function openEditor() {
    await page.getByRole("button", { name: /^(只)?調整本場分團$/ }).click();
    await editor.waitFor();
  }
  async function choose(name, label) {
    await row(name).getByRole("button", { name: label, exact: true }).click();
    await page.getByText("變更即時儲存", { exact: true }).waitFor();
  }
  async function selected(name, team, subRole, source) {
    const buttons = await row(name).locator('button[aria-pressed="true"]').allTextContents();
    assert.deepEqual(buttons, [team, subRole].filter(Boolean), name);
    assert.equal(await row(name).getByRole("cell").nth(4).textContent(), source, name);
  }

  await visit(current);
  assert.equal((await currentRows()).length, 1, "瀏覽分團分析不應載入歷史");
  await openEditor();
  await selected("歷史玩家", "防守", null, "本場調整");
  await selected("本場已調整", "機動", "空拆", "本場調整");
  await selected("舊資料玩家", "防守", null, "本場調整");
  await selected("統一玩家", "進攻", "保鑣", "統一配置");
  await selected("他人同名", "進攻", "保鑣", "統一配置");
  assert.equal((await currentRows()).length, 4, "只載入本帳號、本場我方玩家");
  assert.equal(Number((await savedHistory()).updated_at), 300, "自動帶入應保留原本的調整時間");
  console.log(`PASS [${dialect}]: 最近儲存優先、本場配置優先、帳號與我方玩家篩選`);

  await choose("歷史玩家", "使用統一配置");
  await choose("未分團玩家", "使用統一配置");
  await selected("歷史玩家", "進攻", "保鑣", "統一配置");
  await selected("未分團玩家", null, null, "統一配置（未分團）");
  await page.getByRole("button", { name: "完成調整" }).click();
  await openEditor();
  await selected("歷史玩家", "進攻", "保鑣", "統一配置");
  await visit(current);
  await openEditor();
  await selected("未分團玩家", null, null, "統一配置（未分團）");
  await selected("歷史玩家", "進攻", "保鑣", "統一配置");
  // 統一配置不是複製快照，之後仍會跟隨 /teams 的設定。
  await db.updateTable("team_assignments").set({ main_team: "機動", sub_role: null })
    .where("user_id", "=", userId).where("player_name", "=", "歷史玩家").execute();
  await visit(current);
  await openEditor();
  await selected("歷史玩家", "機動", null, "統一配置");
  console.log(`PASS [${dialect}]: 統一配置在重開與重新整理後持續生效`);

  await choose("歷史玩家", "防守");
  await choose("歷史玩家", "空拆");
  assert.ok(Number((await savedHistory()).updated_at) > 300);
  await visit(next);
  await openEditor();
  await selected("歷史玩家", "防守", "空拆", "本場調整");
  await visit(current);
  await openEditor();
  await selected("歷史玩家", "防守", "空拆", "本場調整");

  await visit(empty);
  await openEditor();
  await selected("無統一歷史", "機動", "空拆", "本場調整");

  const shared = await browser.newPage();
  await shared.goto(`${base}/share/${shareToken}`);
  await shared.getByRole("button", { name: "分團分析", exact: true }).click();
  assert.equal(await shared.getByRole("button", { name: /調整本場分團/ }).count(), 0);
  await shared.getByRole("button").filter({ has: shared.getByRole("heading", { name: "防守團", exact: true }) }).click();
  const sharedRow = shared.getByRole("row").filter({ has: shared.getByRole("cell", { name: /^歷史玩家/ }) });
  await sharedRow.waitFor();
  assert.equal(await sharedRow.getByRole("cell").nth(2).textContent(), "空拆");
  assert.deepEqual(pageErrors, []);
  console.log(`PASS [${dialect}]: 舊 schema 遷移、跨場最近配置、本場優先、統一配置持續生效、無統一配置入口、帳號隔離、分享唯讀`);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    await stopped;
  }
  await db.destroy();
  fs.rmSync(dir, { recursive: true, force: true });
}
