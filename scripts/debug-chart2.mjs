import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto("http://localhost:3000/share/uFNqoJxLNJ5m");
await page.waitForSelector("text=職業構成");
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const path = document.querySelector(".recharts-bar-rectangle path");
  const g = document.querySelector(".recharts-inactive-bar");
  const cs = getComputedStyle(path);
  const csg = getComputedStyle(g);
  return {
    pathFill: cs.fill, pathOpacity: cs.opacity, pathDisplay: cs.display, pathVisibility: cs.visibility,
    gOpacity: csg.opacity, gDisplay: csg.display,
    bbox: path.getBBox ? (() => { const b = path.getBBox(); return { w: b.width, h: b.height }; })() : null,
    allyVar: getComputedStyle(document.documentElement).getPropertyValue("--ally"),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
