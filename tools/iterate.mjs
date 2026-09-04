import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args:["--no-sandbox","--disable-dev-shm-usage","--ignore-gpu-blocklist","--enable-webgl","--use-angle=metal"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction("window.__ready===true", { timeout: 20000 });
await page.evaluate(()=>{ const h=window.__heartbeat; h.stop();
  for(const id of ["boot","start","vignette","grain"]){ const e=document.getElementById(id); if(e) e.remove(); } });
console.log("ready");
const times = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [4,11,15,18,21,26,34];
for (const t of times) {
  await page.evaluate((tt)=>{ const h=window.__heartbeat; h.frame(tt); }, t);
  await new Promise(r=>setTimeout(r,120));
  await page.screenshot({ path: `shots/iter_${String(t).padStart(2,"0")}.png` });
  console.log("iter", t);
}
await browser.close();
