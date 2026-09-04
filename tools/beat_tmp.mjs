import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";

const ROOT = "/Users/Admin/Documents/Default Project/heartbeat";
const URL = "http://127.0.0.1:5173/";
async function up() { try { await fetch(URL, { method: "HEAD" }); return true; } catch { return false; } }
if (!(await up())) {
  const s = spawn("npx", ["vite"], { cwd: ROOT, stdio: "pipe" });
  await new Promise((r) => { s.stdout.on("data", (d) => String(d).includes("Local") && r()); setTimeout(r, 6000); });
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=metal", "--window-size=1600,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction("window.__ready===true", { timeout: 20000 });
await page.evaluate(() => { for (const id of ["boot", "vignette", "grain"]) { const e = document.getElementById(id); if (e) e.remove(); } });

async function measure(t) {
  const r = await page.evaluate((t) => {
    const h = window.__heartbeat;
    h.frame(t);
    const s = h.sample(t);
    const gl = h.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let sum = 0, hot = 0, n = W * H;
    for (let i = 0; i < buf.length; i += 4) {
      const l = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
      sum += l;
      if (l > 0.7) hot++;
    }
    return {
      lum: (sum / n).toFixed(4),
      hotPct: ((hot / n) * 100).toFixed(2),
      beat: s.beat.toFixed(3),
      coreScale: (0.9 + s.beat * 0.55).toFixed(3),
      keyLight: (10 + s.beat * 12).toFixed(1),
      coreLight: (s.coreIntensity * (4 + s.beat * 15)).toFixed(1),
      beatScale: (1 + 0.048 * s.beat).toFixed(4),
    };
  }, t);
  console.log(`t=${t.toFixed(2)}  lum=${r.lum}  hot=${r.hotPct}%  beat=${r.beat}  coreScale=${r.coreScale}  key=${r.keyLight}  coreL=${r.coreLight}  scale=${r.beatScale}`);
}

console.log("Hero pulse sweep around a heartbeat (t≈49.4–51.0):");
for (let t = 49.4; t <= 51.0; t += 0.1) await measure(t);
await browser.close();