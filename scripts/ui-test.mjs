// UI 流程測試 + 截圖：node scripts/ui-test.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

const errors = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return page;
}

// --- 登入流程 ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await newPage(ctx);
await page.goto(`${BASE}/login`);
await page.fill('input[name="username"]', "testuser");
await page.fill('input[name="password"]', "test123456");
await page.click('button:has-text("登入")');
await page.waitForURL("**/dashboard");
await page.waitForSelector("text=我的場次");
await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
console.log("dashboard ok");

// --- 場次總覽 ---
await page.click('a:has-text("歲歲有今朝 vs 歲歲醉江南")');
await page.waitForSelector("text=全隊數據對比");
await page.waitForTimeout(800); // 等圖表動畫
await page.screenshot({ path: `${OUT}/02-match-overview.png`, fullPage: true });
console.log("overview ok");

// --- 職業統計 ---
await page.click('button:has-text("職業統計")');
await page.waitForSelector("text=各職業平均對比");
await page.click('button:has-text("平均治療值")');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/03-class-stats.png`, fullPage: true });
console.log("class stats ok");

// --- 玩家數據 + 詳細 modal ---
await page.click('button:has-text("玩家數據")');
await page.waitForSelector("text=位玩家");
await page.screenshot({ path: `${OUT}/04-players-table.png`, fullPage: true });
await page.click("tbody tr:first-child");
await page.waitForSelector("text=全隊貢獻佔比");
await page.screenshot({ path: `${OUT}/05-player-detail.png`, fullPage: true });
await page.keyboard.press("Escape");
console.log("player detail ok");

// --- 跨場比較 ---
await page.goto(`${BASE}/players`);
await page.waitForSelector("text=玩家跨場比較");
await page.fill('input[placeholder="搜尋玩家名字…"]', "理玖");
await page.click('button:has-text("理玖")');
await page.waitForSelector("text=各場次明細");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/06-player-compare.png`, fullPage: true });
console.log("compare ok");

// --- 未登入分享頁（新 context，無 cookie）+ 深色模式 ---
const shareToken = process.argv[2];
const ctx2 = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  colorScheme: "dark",
});
const page2 = await newPage(ctx2);
await page2.goto(`${BASE}/share/${shareToken}`);
await page2.waitForSelector("text=此為分享的唯讀戰報檢視");
await page2.waitForTimeout(800);
await page2.screenshot({ path: `${OUT}/07-share-dark.png`, fullPage: true });
console.log("share(dark) ok");

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of errors) console.log("  " + e.slice(0, 300));
} else {
  console.log("no console errors");
}
await browser.close();
