import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
const ROOT = "/Users/Admin/Documents/Default Project/heartbeat";
const URL = "http://127.0.0.1:5173/";
async function up() { try { await fetch(URL, { method: "HEAD" }); return true; } catch { return false; } }
if (!(await up())) { const s = spawn("npx", ["vite"], { cwd: ROOT, stdio: "pipe" }); await new Promise((r) => { s.stdout.on("data", (d) => String(d).includes("Local") && r()); setTimeout(r, 6000); }); }
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--window-size=1600,1000"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction("window.__ready===true", { timeout: 20000 });
await page.evaluate(() => { for (const id of ["boot", "vignette", "grain", "start"]) { const e = document.getElementById(id); if (e) e.remove(); } });

// 1) Message-DOM-Check at t=50 (visible)
await page.evaluate(() => window.__heartbeat.frame(50));
const msg = await page.evaluate(() => {
  const m = document.getElementById("message");
  const h1 = m.querySelector("h1");
  const cs = getComputedStyle(h1);
  const rect = h1.getBoundingClientRect();
  return {
    visible: m.className.includes("visible"),
    fontFamily: cs.fontFamily.split(",")[0],
    fontSize: cs.fontSize,
    letterSpacing: cs.letterSpacing,
    textTransform: cs.textTransform,
    color: cs.color,
    textShadow: cs.textShadow,
    rect: { w: Math.round(rect.width), h: Math.round(rect.height), bottom: Math.round(window.innerHeight - rect.bottom) },
  };
});
console.log("MESSAGE DOM:", JSON.stringify(msg));

// 2) ASCII at key frames
const W = 96, H = 32;
async function ascii(t) {
  return await page.evaluate(async ({ t, W, H }) => {
    const h = window.__heartbeat;
    h.frame(t);
    const canvas = h.renderer.domElement;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let out = "";
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        let ch = " ";
        if (l > 0.10 && l <= 0.20) ch = ".";
        if (l > 0.20 && l <= 0.35) ch = "o";
        if (l > 0.35 && l <= 0.55) ch = "P";
        if (l > 0.55) ch = "W";
        row += ch;
      }
      out += row + "\n";
    }
    return out;
  }, { t, W, H });
}
for (const t of [6, 15, 26, 34, 50]) {
  console.log(`\n===== t=${t} =====`);
  console.log(await ascii(t));
}

// 3) beat check
async function stats(t) {
  return await page.evaluate((t) => {
    const h = window.__heartbeat;
    h.frame(t);
    const gl = h.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let sum = 0, hot = 0, n = W * H;
    for (let i = 0; i < buf.length; i += 4) { const l = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255; sum += l; if (l > 0.7) hot++; }
    return { lum: (sum / n).toFixed(4), hotPct: ((hot / n) * 100).toFixed(2) };
  }, t);
}
console.log("\n--- Puls (real) ---");
for (const t of [49.4, 49.6, 49.7, 50]) console.log(`t=${t}`, JSON.stringify(await stats(t)));
await browser.close();