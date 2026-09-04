import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";

const ROOT = "/Users/Admin/Documents/Default Project/heartbeat";
const URL = "http://127.0.0.1:5173/";
async function up() { try { await fetch(URL, { method: "HEAD" }); return true; } catch { return false; } }
if (!(await up())) { const s = spawn("npx", ["vite"], { cwd: ROOT, stdio: "pipe" }); await new Promise((r) => { s.stdout.on("data", (d) => String(d).includes("Local") && r()); setTimeout(r, 6000); }); }

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--window-size=800,1000"] });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });

const events = [];
page.on("console", (m) => { if (m.type() === "error") events.push(`[console.error] ${m.text().slice(0,160)}`); });
page.on("pageerror", (e) => events.push(`[pageerror] ${e.message}`));
page.on("framenavigated", (f) => events.push(`[framenavigated] ${f.url()}`));
page.on("load", () => events.push("[load]"));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction("window.__ready===true", { timeout: 20000 });

const scroll = await page.evaluate(() => ({
  bodyScrollH: document.body.scrollHeight,
  bodyClientH: document.body.clientHeight,
  docScrollH: document.scrollingElement.scrollHeight,
  docClientH: document.scrollingElement.clientHeight,
  grainRect: document.getElementById("grain").getBoundingClientRect().toJSON(),
  meta: document.querySelector('meta[name=viewport]').content,
}));
console.log("--- Scrollability ---");
console.log(JSON.stringify(scroll, null, 2));

// Touch tap on #start (center)
const box = await page.evaluate(() => { const r = document.getElementById("start").getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
async function tap(x, y) {
  const s = await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }).catch(()=>{});
  await new Promise(r => setTimeout(r, 60));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(()=>{});
  await new Promise(r => setTimeout(r, 300));
}

console.log("\n--- 3 schnelle Taps auf #start ---");
for (let i = 0; i < 3; i++) { await tap(box.x, box.y); }

// A pull-down gesture (overscroll at top) — like iOS pull-to-refresh
console.log("\n--- Pull-down-Geste von oben ---");
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 400, y: 100 }] });
for (let y = 100; y <= 500; y += 60) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 400, y }] });
  await new Promise(r => setTimeout(r, 30));
}
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise(r => setTimeout(r, 1200));

console.log("\n--- EVENTS ---");
console.log(events.length ? events.join("\n") : "(keine)");