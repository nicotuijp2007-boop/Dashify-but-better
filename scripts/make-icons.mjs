// Renders public/icons/icon.svg to the PNG sizes iOS and the manifest need.
// Uses Playwright's Chromium:  node scripts/make-icons.mjs
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, inset] of [
  ["apple-touch-icon.png", 180, 0],
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  // Maskable: keep the meter inside the 80% safe zone.
  ["icon-maskable-512.png", 512, 0.1],
]) {
  await page.setViewportSize({ width: size, height: size });
  const pad = Math.round(size * inset);
  await page.setContent(
    `<body style="margin:0;background:#1a1a19"><div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
}
await browser.close();
