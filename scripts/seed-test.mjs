// 測試種子：建立測試帳號、匯入目錄下兩個真實 CSV、開啟一場分享
// 用法：node scripts/seed-test.mjs
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const db = new Database(path.join(process.cwd(), "data", "app.db"), {
  timeout: 10000,
});

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

// 使用者 + session
const hash = bcrypt.hashSync("test123456", 10);
db.prepare("DELETE FROM users WHERE username = ?").run("testuser");
const userId = Number(
  db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run("testuser", hash).lastInsertRowid
);
const sessionToken = crypto.randomBytes(32).toString("hex");
db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
  sessionToken,
  userId,
  Date.now() + 86400000
);

// 匯入 CSV
const csvDir = path.resolve(process.cwd(), "..");
const files = fs.readdirSync(csvDir).filter((f) => f.endsWith(".csv"));
const insertMatch = db.prepare(
  `INSERT INTO matches (user_id, title, ally_name, ally_count, enemy_name, enemy_count)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertPlayer = db.prepare(
  `INSERT INTO players (match_id, side, name, cls, kills, assists, resources,
     player_damage, building_damage, healing, damage_taken, deaths, purify, burn)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

let firstMatchId = null;
for (const file of files) {
  const text = fs.readFileSync(path.join(csvDir, file), "utf8").replace(/^﻿/, "");
  const [ally, enemy] = parseCsv(text);
  const matchId = Number(
    insertMatch.run(
      userId,
      `${ally.guildName} vs ${enemy.guildName}`,
      ally.guildName,
      ally.memberCount,
      enemy.guildName,
      enemy.memberCount
    ).lastInsertRowid
  );
  firstMatchId ??= matchId;
  for (const [side, section] of [ally, enemy].entries()) {
    for (const f of section.players) {
      insertPlayer.run(
        matchId, side, f[0], f[1],
        ...f.slice(2).map((x) => Number(String(x).replace(/,/g, "")))
      );
    }
  }
  console.log(`imported match ${matchId}: ${ally.guildName} (${ally.players.length}) vs ${enemy.guildName} (${enemy.players.length})`);
}

const shareToken = crypto.randomBytes(9).toString("base64url");
db.prepare("UPDATE matches SET share_token = ? WHERE id = ?").run(
  shareToken,
  firstMatchId
);

console.log(JSON.stringify({ sessionToken, shareToken, firstMatchId }));
