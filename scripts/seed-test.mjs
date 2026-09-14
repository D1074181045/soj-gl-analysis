// 測試種子：建立測試帳號、匯入目錄下兩個真實 CSV、開啟一場分享
// 用法：node scripts/seed-test.mjs   （依 DB_DIALECT / DATABASE_URL 連線；預設 SQLite）
// 需先 build：走 .next/standalone 內編譯好的 lib 太麻煩，這裡直接用 Kysely 重建同一份 schema 邏輯。
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect, sql } from "kysely";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIALECT = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
const URL = process.env.DATABASE_URL;

async function createDb() {
  if (DIALECT === "sqlite") {
    const { default: Database } = await import("better-sqlite3");
    const file = URL ?? path.join(process.cwd(), "data", "app.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new Database(file, { timeout: 10000 });
    sqlite.pragma("foreign_keys = ON");
    return new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
  }
  if (DIALECT === "mysql") {
    const { createPool } = await import("mysql2");
    return new Kysely({ dialect: new MysqlDialect({ pool: createPool({ uri: URL }) }) });
  }
  const { default: pg } = await import("pg");
  return new Kysely({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: URL }) }),
  });
}

async function insertId(q) {
  if (DIALECT === "postgres") {
    const r = await q.returning("id").executeTakeFirstOrThrow();
    return Number(r.id);
  }
  const r = await q.executeTakeFirstOrThrow();
  return Number(r.insertId);
}

async function insertIgnore(db, table, row) {
  const q = db.insertInto(table).values(row);
  if (DIALECT === "mysql") await q.ignore().execute();
  else await q.onConflict((oc) => oc.columns(["user_id", "name"]).doNothing()).execute();
}

function parseLine(line) {
  const fields = [];
  const re = /"((?:[^"]|"")*)"/g;
  let m;
  while ((m = re.exec(line)) !== null) fields.push(m[1].replace(/""/g, '"'));
  return fields;
}

function parseCsv(text) {
  const sections = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const f = parseLine(line);
    if (f.length === 2 && /^\d+$/.test(f[1].trim())) {
      current = { guildName: f[0], memberCount: Number(f[1]), players: [] };
      sections.push(current);
    } else if (f.length === 12 && f[0] !== "玩家名字") {
      current.players.push(f);
    }
  }
  if (sections.length !== 2) throw new Error("expected 2 sections");
  return sections;
}

const db = await createDb();

// 確認 schema 已由應用程式建立（至少跑過一次伺服器）
try {
  await db.selectFrom("users").select("id").limit(1).execute();
} catch {
  console.error("找不到資料表：請先啟動一次應用程式（npm start）讓它建立 schema。");
  process.exit(1);
}

// 使用者 + session
const hash = bcrypt.hashSync("test123456", 10);
await db.deleteFrom("users").where("username", "=", "testuser").execute();
const userId = await insertId(
  db.insertInto("users").values({ username: "testuser", password_hash: hash })
);
const sessionToken = crypto.randomBytes(32).toString("hex");
await db
  .insertInto("sessions")
  .values({ token: sessionToken, user_id: userId, expires_at: Date.now() + 86400000 })
  .execute();

// 直接建帳號會略過註冊流程的預設清單，這裡補上（與 lib/db.ts 的預設一致）
for (const [i, name] of ["進攻", "機動", "防守"].entries()) {
  await insertIgnore(db, "user_teams", { user_id: userId, name, sort_order: i });
}
for (const [i, name] of ["保鑣", "扛拆", "空拆"].entries()) {
  await insertIgnore(db, "user_sub_roles", { user_id: userId, name, sort_order: i });
}

// 匯入 CSV
const csvDir = path.resolve(process.cwd(), "..");
const files = fs.readdirSync(csvDir).filter((f) => f.endsWith(".csv"));
const cols = [
  "kills", "assists", "resources", "player_damage", "building_damage",
  "healing", "damage_taken", "deaths", "purify", "burn",
];

let firstMatchId = null;
for (const file of files) {
  const text = fs.readFileSync(path.join(csvDir, file), "utf8").replace(/^﻿/, "");
  const [ally, enemy] = parseCsv(text);
  const matchId = await insertId(
    db.insertInto("matches").values({
      user_id: userId,
      title: `${ally.guildName} vs ${enemy.guildName}`,
      ally_name: ally.guildName,
      ally_count: ally.memberCount,
      enemy_name: enemy.guildName,
      enemy_count: enemy.memberCount,
    })
  );
  firstMatchId ??= matchId;
  const rows = [ally, enemy].flatMap((section, side) =>
    section.players.map((f) => {
      const row = { match_id: matchId, side, name: f[0], cls: f[1] };
      f.slice(2).forEach((x, i) => (row[cols[i]] = Number(String(x).replace(/,/g, ""))));
      return row;
    })
  );
  for (let i = 0; i < rows.length; i += 50) {
    await db.insertInto("players").values(rows.slice(i, i + 50)).execute();
  }
  console.log(`imported match ${matchId}: ${ally.guildName} (${ally.players.length}) vs ${enemy.guildName} (${enemy.players.length})`);
}

const shareToken = crypto.randomBytes(9).toString("base64url");
await db
  .updateTable("matches")
  .set({ share_token: shareToken })
  .where("id", "=", firstMatchId)
  .execute();

console.log(JSON.stringify({ sessionToken, shareToken, firstMatchId }));
await db.destroy();
void sql;
