import { Kysely, sql } from "kysely";
import type { ColumnDefinitionBuilder, Generated } from "kysely";
import { MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// 對外 id：128 bit 隨機、URL 安全、無規律（22 字元）
export function newPublicId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

// ===== 資料表型別（Kysely）=====
export interface UsersTable {
  id: Generated<number>;
  username: string;
  password_hash: string;
  created_at: Generated<Date | string>;
}
export interface SessionsTable {
  token: string;
  user_id: number;
  expires_at: number; // epoch ms
}
export interface MatchesTable {
  id: Generated<number>; // 內部關聯用，不對外暴露
  public_id: string; // 對外的隨機 id（網址／表單／action 一律用這個）
  user_id: number;
  title: string;
  ally_name: string;
  ally_count: number;
  enemy_name: string;
  enemy_count: number;
  share_token: string | null;
  created_at: Generated<Date | string>;
  team_defaults_loaded: Generated<number>; // 首次開啟本場調整後，不再自動套用歷史配置
}
export interface PlayersTable {
  id: Generated<number>;
  match_id: number;
  side: number; // 0 = 我方, 1 = 對方
  name: string;
  cls: string;
  kills: number;
  assists: number;
  resources: number;
  player_damage: number;
  building_damage: number;
  healing: number;
  damage_taken: number;
  deaths: number;
  purify: number;
  burn: number;
}
export interface TeamAssignmentsTable {
  user_id: number;
  player_name: string;
  main_team: string;
  sub_role: string | null;
}
export interface MatchTeamAssignmentsTable {
  match_id: number;
  player_name: string;
  main_team: string;
  sub_role: string | null;
  updated_at: Generated<number>; // 最後調整時間（epoch ms）；舊資料為 0
}
export interface UserTeamsTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  sort_order: number;
}
export interface UserSubRolesTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  sort_order: number;
}
export interface SchemaMetaTable {
  key: string;
  value: string;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  matches: MatchesTable;
  players: PlayersTable;
  team_assignments: TeamAssignmentsTable;
  match_team_assignments: MatchTeamAssignmentsTable;
  user_teams: UserTeamsTable;
  user_sub_roles: UserSubRolesTable;
  schema_meta: SchemaMetaTable;
}

// ===== 方言 =====
export type Dialect = "sqlite" | "mysql" | "postgres";

function resolveDialect(): Dialect {
  const raw = (process.env.DB_DIALECT ?? "sqlite").toLowerCase();
  if (raw === "sqlite" || raw === "mysql" || raw === "postgres") return raw;
  if (raw === "postgresql" || raw === "pg") return "postgres";
  if (raw === "mariadb") return "mysql";
  throw new Error(`不支援的 DB_DIALECT：${raw}（可用：sqlite、mysql、postgres）`);
}

export const DIALECT: Dialect = resolveDialect();

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DB_DIALECT=${DIALECT} 需要設定 DATABASE_URL`);
  return url;
}

function createDb(): Kysely<Database> {
  if (DIALECT === "sqlite") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");
    const file = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "app.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new BetterSqlite3(file, { timeout: 10000 });
    try {
      sqlite.pragma("journal_mode = WAL");
    } catch {
      /* 其他連線正在切換 journal mode 時容忍失敗 */
    }
    sqlite.pragma("foreign_keys = ON");
    return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  }
  if (DIALECT === "mysql") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPool } = require("mysql2") as typeof import("mysql2");
    return new Kysely<Database>({
      dialect: new MysqlDialect({
        pool: createPool({ uri: requireUrl(), connectionLimit: 10 }),
      }),
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg") as typeof import("pg");
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireUrl(), max: 10 }) }),
  });
}

// 以 globalThis 快取連線：dev HMR 與 build worker 下避免重複開啟
const g = globalThis as typeof globalThis & {
  __appDb?: Kysely<Database>;
  __appDbReady?: Promise<void>;
};

export const db: Kysely<Database> = g.__appDb ?? createDb();
g.__appDb = db;

// ===== 方言差異集中在這裡 =====

// 自動遞增主鍵：Postgres 用 serial（自帶遞增）；SQLite/MySQL 用 integer + autoIncrement
const pkType = () => (DIALECT === "postgres" ? ("serial" as const) : ("integer" as const));
const pkCol = (col: ColumnDefinitionBuilder) =>
  DIALECT === "postgres" ? col.primaryKey() : col.primaryKey().autoIncrement();
// 字串主鍵/唯一鍵在 MySQL 需要定長型別
const keyText = () => (DIALECT === "mysql" ? sql`varchar(191)` : sql`text`);
const nameText = keyText;
// 時間戳記
const nowDefault = () => sql`CURRENT_TIMESTAMP`;
const timestampType = () =>
  DIALECT === "postgres" ? sql`timestamptz` : DIALECT === "mysql" ? sql`datetime` : sql`text`;

// ===== Schema =====

// MySQL 不支援 CREATE INDEX IF NOT EXISTS，改查 information_schema 判斷
async function createIndexIfMissing(
  name: string,
  table: keyof Database,
  column: string,
  unique = false
): Promise<void> {
  if (DIALECT === "mysql") {
    const rows = await sql<{ c: number | string }>`
      SELECT COUNT(*) AS c FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${name}
    `.execute(db);
    if (Number(rows.rows[0]?.c ?? 0) > 0) return;
    const q = db.schema.createIndex(name).on(table).column(column);
    await (unique ? q.unique() : q).execute();
    return;
  }
  const q = db.schema.createIndex(name).ifNotExists().on(table).column(column);
  await (unique ? q.unique() : q).execute();
}

// 遷移：舊資料庫的 matches 沒有 public_id 欄位時補上並回填隨機 id
async function ensureMatchPublicId(): Promise<void> {
  let hasColumn = true;
  try {
    await db.selectFrom("matches").select("public_id").limit(1).execute();
  } catch {
    hasColumn = false;
  }
  if (!hasColumn) {
    await db.schema.alterTable("matches").addColumn("public_id", keyText()).execute();
  }
  const missing = await db
    .selectFrom("matches")
    .select("id")
    .where("public_id", "is", null)
    .execute();
  for (const r of missing) {
    await db
      .updateTable("matches")
      .set({ public_id: newPublicId() })
      .where("id", "=", r.id)
      .execute();
  }
  if (!hasColumn) {
    await createIndexIfMissing("uq_matches_public_id", "matches", "public_id", true);
  }
}

// 舊資料沒有調整時間，保留為 0，讀取歷史時再以場次時間排序。
async function ensureTeamDefaultsColumns(): Promise<void> {
  const tables = await db.introspection.getTables();
  if (!tables.find((t) => t.name === "matches")?.columns.some((c) => c.name === "team_defaults_loaded")) {
    await db.schema.alterTable("matches")
      .addColumn("team_defaults_loaded", "integer", (c) => c.notNull().defaultTo(0))
      .execute();
  }
  if (!tables.find((t) => t.name === "match_team_assignments")?.columns.some((c) => c.name === "updated_at")) {
    await db.schema.alterTable("match_team_assignments")
      .addColumn("updated_at", "bigint", (c) => c.notNull().defaultTo(0))
      .execute();
  }
}

async function ensureSchema(): Promise<void> {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", pkType(), pkCol)
    .addColumn("username", keyText(), (c) => c.notNull().unique())
    .addColumn("password_hash", sql`text`, (c) => c.notNull())
    .addColumn("created_at", timestampType(), (c) => c.notNull().defaultTo(nowDefault()))
    .execute();

  await db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("token", keyText(), (c) => c.primaryKey())
    .addColumn("user_id", "integer", (c) =>
      c.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("expires_at", "bigint", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("matches")
    .ifNotExists()
    .addColumn("id", pkType(), pkCol)
    .addColumn("public_id", keyText(), (c) => c.notNull().unique())
    .addColumn("user_id", "integer", (c) =>
      c.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("title", sql`text`, (c) => c.notNull())
    .addColumn("ally_name", sql`text`, (c) => c.notNull())
    .addColumn("ally_count", "integer", (c) => c.notNull())
    .addColumn("enemy_name", sql`text`, (c) => c.notNull())
    .addColumn("enemy_count", "integer", (c) => c.notNull())
    .addColumn("share_token", keyText(), (c) => c.unique())
    .addColumn("created_at", timestampType(), (c) => c.notNull().defaultTo(nowDefault()))
    .addColumn("team_defaults_loaded", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("players")
    .ifNotExists()
    .addColumn("id", pkType(), pkCol)
    .addColumn("match_id", "integer", (c) =>
      c.notNull().references("matches.id").onDelete("cascade")
    )
    .addColumn("side", "integer", (c) => c.notNull())
    .addColumn("name", nameText(), (c) => c.notNull())
    .addColumn("cls", sql`text`, (c) => c.notNull())
    .addColumn("kills", "integer", (c) => c.notNull())
    .addColumn("assists", "integer", (c) => c.notNull())
    .addColumn("resources", "integer", (c) => c.notNull())
    .addColumn("player_damage", "bigint", (c) => c.notNull())
    .addColumn("building_damage", "bigint", (c) => c.notNull())
    .addColumn("healing", "bigint", (c) => c.notNull())
    .addColumn("damage_taken", "bigint", (c) => c.notNull())
    .addColumn("deaths", "integer", (c) => c.notNull())
    .addColumn("purify", "integer", (c) => c.notNull())
    .addColumn("burn", "integer", (c) => c.notNull())
    .execute();

  await createIndexIfMissing("idx_players_match", "players", "match_id");
  await createIndexIfMissing("idx_players_name", "players", "name");
  await createIndexIfMissing("idx_matches_user", "matches", "user_id");
  await ensureMatchPublicId();

  await db.schema
    .createTable("team_assignments")
    .ifNotExists()
    .addColumn("user_id", "integer", (c) =>
      c.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("player_name", nameText(), (c) => c.notNull())
    .addColumn("main_team", sql`text`, (c) => c.notNull())
    .addColumn("sub_role", sql`text`)
    .addPrimaryKeyConstraint("pk_team_assignments", ["user_id", "player_name"])
    .execute();

  await db.schema
    .createTable("match_team_assignments")
    .ifNotExists()
    .addColumn("match_id", "integer", (c) =>
      c.notNull().references("matches.id").onDelete("cascade")
    )
    .addColumn("player_name", nameText(), (c) => c.notNull())
    .addColumn("main_team", sql`text`, (c) => c.notNull())
    .addColumn("sub_role", sql`text`)
    .addPrimaryKeyConstraint("pk_match_team_assignments", ["match_id", "player_name"])
    .addColumn("updated_at", "bigint", (c) => c.notNull().defaultTo(0))
    .execute();

  await ensureTeamDefaultsColumns();

  await db.schema
    .createTable("user_teams")
    .ifNotExists()
    .addColumn("id", pkType(), pkCol)
    .addColumn("user_id", "integer", (c) =>
      c.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("name", nameText(), (c) => c.notNull())
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addUniqueConstraint("uq_user_teams", ["user_id", "name"])
    .execute();

  await db.schema
    .createTable("user_sub_roles")
    .ifNotExists()
    .addColumn("id", pkType(), pkCol)
    .addColumn("user_id", "integer", (c) =>
      c.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("name", nameText(), (c) => c.notNull())
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addUniqueConstraint("uq_user_sub_roles", ["user_id", "name"])
    .execute();

  await db.schema
    .createTable("schema_meta")
    .ifNotExists()
    .addColumn("key", keyText(), (c) => c.primaryKey())
    .addColumn("value", sql`text`, (c) => c.notNull())
    .execute();

  await runOnce("teams_seeded", async () => {
    const users = await db.selectFrom("users").select("id").execute();
    for (const u of users) await seedDefaultTeams(u.id);
  });
  await runOnce("sub_roles_seeded", async () => {
    const users = await db.selectFrom("users").select("id").execute();
    for (const u of users) await seedDefaultSubRoles(u.id);
  });
}

export const DEFAULT_TEAM_NAMES = ["進攻", "機動", "防守"];
export const DEFAULT_SUB_ROLE_NAMES = ["保鑣", "扛拆", "空拆"];

// INSERT ... 忽略重複（三方言）
export async function insertIgnore(
  table: "user_teams" | "user_sub_roles",
  row: { user_id: number; name: string; sort_order: number }
): Promise<void> {
  const q = db.insertInto(table).values(row);
  if (DIALECT === "mysql") {
    await q.ignore().execute();
  } else {
    await q.onConflict((oc) => oc.columns(["user_id", "name"]).doNothing()).execute();
  }
}

// 為使用者建立預設主團（註冊時與一次性遷移時使用）
export async function seedDefaultTeams(userId: number): Promise<void> {
  for (const [i, name] of DEFAULT_TEAM_NAMES.entries()) {
    await insertIgnore("user_teams", { user_id: userId, name, sort_order: i });
  }
}

// 為使用者建立預設副職（註冊時與一次性遷移時使用）
export async function seedDefaultSubRoles(userId: number): Promise<void> {
  for (const [i, name] of DEFAULT_SUB_ROLE_NAMES.entries()) {
    await insertIgnore("user_sub_roles", { user_id: userId, name, sort_order: i });
  }
}

// 一次性遷移：以 schema_meta 記錄已跑過的 key
async function runOnce(key: string, fn: () => Promise<void>): Promise<void> {
  const done = await db
    .selectFrom("schema_meta")
    .select("value")
    .where("key", "=", key)
    .executeTakeFirst();
  if (done) return;
  await fn();
  await db.insertInto("schema_meta").values({ key, value: "1" }).execute();
}

// 確保 schema 已建立（所有查詢前呼叫；只會真正執行一次）
export function ready(): Promise<void> {
  if (!g.__appDbReady) {
    g.__appDbReady = ensureSchema().catch((e) => {
      g.__appDbReady = undefined; // 失敗時允許下次重試
      throw e;
    });
  }
  return g.__appDbReady;
}

// 取得 INSERT 後的自增 id（Postgres 用 RETURNING，其餘用 insertId）
export async function insertReturningId<T extends "users" | "matches" | "user_teams" | "user_sub_roles">(
  table: T,
  values: Parameters<ReturnType<typeof db.insertInto<T>>["values"]>[0]
): Promise<number> {
  const q = db.insertInto(table).values(values);
  if (DIALECT === "postgres") {
    const row = await q.returning("id" as never).executeTakeFirstOrThrow();
    return Number((row as unknown as { id: number }).id);
  }
  const res = await q.executeTakeFirstOrThrow();
  return Number(res.insertId);
}

// 資料庫回傳的時間戳記統一轉成 ISO 字串（SQLite 回 'YYYY-MM-DD HH:MM:SS' UTC 字串、其餘回 Date）
export function toIso(v: Date | string | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (s.includes("T")) return s;
  return s.replace(" ", "T") + "Z";
}

export default db;
