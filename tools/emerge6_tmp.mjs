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

const W = 96, H = 32;
async function render(t) {
  const { out, s, lum } = await page.evaluate(async ({ t, W, H }) => {
    const h = window.__heartbeat;
    h.frame(t);
    const s = h.sample(t);
    const canvas = h.renderer.domElement;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let out = "", sum = 0;
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sum += l;
        let ch = " ";
        if (l > 0.10 && l <= 0.20) ch = ".";
        if (l > 0.20 && l <= 0.35) ch = "o";
        if (l > 0.35 && l <= 0.55) ch = "P";
        if (l > 0.55) ch = "W";
        row += ch;
      }
      out += row + "\n";
    }
    return { out, s, lum: (sum / (W * H)).toFixed(4) };
  }, { t, W, H });
  console.log(`\n===== t=${t}  lum=${lum}  materialize=${s.materialize.toFixed(2)} core=${s.coreIntensity.toFixed(2)} aura=${s.auraIntensity.toFixed(2)} rotY=${s.heartRotY.toFixed(2)} =====`);
  console.log(out);
}
for (const t of [12, 13, 14, 15, 16, 17, 18, 19, 20]) await render(t);
await browser.close();