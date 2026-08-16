import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", m => console.log("[console]", m.type(), m.text().slice(0,200)));
page.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await page.goto("http://localhost:3000/share/uFNqoJxLNJ5m");
await page.waitForSelector("text=職業構成");
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const svg = document.querySelector(".recharts-wrapper svg");
  if (!svg) return "no svg";
  const rects = svg.querySelectorAll("path.recharts-rectangle, rect.recharts-rectangle, .recharts-bar-rectangle");
  const bars = svg.querySelectorAll(".recharts-bar");
  return {
    barsGroups: bars.length,
    rectangles: rects.length,
    firstRect: rects[0]?.outerHTML?.slice(0, 300) ?? null,
    svgChildren: [...svg.children].map(c => c.getAttribute("class")).slice(0, 10),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
