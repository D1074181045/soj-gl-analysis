import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

// 以 globalThis 快取連線：dev HMR 與 build worker 下避免重複開啟
const g = globalThis as typeof globalThis & { __appDb?: Database.Database };

const db =
  g.__appDb ?? new Database(path.join(dataDir, "app.db"), { timeout: 10000 });
g.__appDb = db;

try {
  db.pragma("journal_mode = WAL");
} catch {
  // 其他連線正在切換 journal mode 時容忍失敗（busy），不影響功能
}
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  ally_name TEXT NOT NULL,
  ally_count INTEGER NOT NULL,
  enemy_name TEXT NOT NULL,
  enemy_count INTEGER NOT NULL,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side INTEGER NOT NULL, -- 0 = 我方, 1 = 對方
  name TEXT NOT NULL,
  cls TEXT NOT NULL,
  kills INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  resources INTEGER NOT NULL,
  player_damage INTEGER NOT NULL,
  building_damage INTEGER NOT NULL,
  healing INTEGER NOT NULL,
  damage_taken INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  purify INTEGER NOT NULL,
  burn INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_match ON players(match_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE TABLE IF NOT EXISTS team_assignments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  main_team TEXT NOT NULL,  -- 進攻 | 機動 | 防守
  sub_role TEXT,            -- 保鑣 | 扛拆 | 空拆 | NULL
  PRIMARY KEY (user_id, player_name)
);
CREATE TABLE IF NOT EXISTS match_team_assignments (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  main_team TEXT NOT NULL,  -- 進攻 | 機動 | 防守
  sub_role TEXT,            -- 保鑣 | 扛拆 | 空拆 | NULL
  PRIMARY KEY (match_id, player_name)
);
CREATE TABLE IF NOT EXISTS user_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS user_sub_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const DEFAULT_TEAM_NAMES = ["進攻", "機動", "防守"];
export const DEFAULT_SUB_ROLE_NAMES = ["保鑣", "扛拆", "空拆"];

// 為使用者建立預設主團（註冊時與一次性遷移時使用）
export function seedDefaultTeams(userId: number): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO user_teams (user_id, name, sort_order) VALUES (?, ?, ?)"
  );
  DEFAULT_TEAM_NAMES.forEach((name, i) => insert.run(userId, name, i));
}

// 為使用者建立預設副職（註冊時與一次性遷移時使用）
export function seedDefaultSubRoles(userId: number): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO user_sub_roles (user_id, name, sort_order) VALUES (?, ?, ?)"
  );
  DEFAULT_SUB_ROLE_NAMES.forEach((name, i) => insert.run(userId, name, i));
}

// 一次性遷移：主團/副職改為可自訂前建立的帳號，補上預設清單
function runOnce(key: string, fn: () => void): void {
  const done = db
    .prepare("SELECT value FROM schema_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (done) return;
  db.transaction(() => {
    fn();
    db.prepare("INSERT INTO schema_meta (key, value) VALUES (?, '1')").run(key);
  })();
}

runOnce("teams_seeded", () => {
  const users = db.prepare("SELECT id FROM users").all() as { id: number }[];
  for (const u of users) seedDefaultTeams(u.id);
});

runOnce("sub_roles_seeded", () => {
  const users = db.prepare("SELECT id FROM users").all() as { id: number }[];
  for (const u of users) seedDefaultSubRoles(u.id);
});

export default db;
