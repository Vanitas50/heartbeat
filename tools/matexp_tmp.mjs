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
// returns ASCII + a facet-noise score (number of lum sign-flips in the subject region)
async function snap(t, label, mutate) {
  const res = await page.evaluate(async ({ t, W, H, mutate }) => {
    const h = window.__heartbeat;
    h.frame(t);
    if (mutate) mutate();
    h.post.render();
    const canvas = h.renderer.domElement;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let out = "";
    let flips = 0, subject = 0;
    for (let y = 0; y < H; y++) {
      let row = "";
      let prev = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        let ch = " ";
        if (lum > 0.10 && lum <= 0.20) ch = ".";
        if (lum > 0.20 && lum <= 0.35) ch = "o";
        if (lum > 0.35 && lum <= 0.55) ch = "P";
        if (lum > 0.55) ch = "W";
        row += ch;
        if (lum > 0.10) {
          subject++;
          const b2 = lum > 0.35 ? 1 : 0;
          if (x > 0 && b2 !== prev) flips++;
          prev = b2;
        }
      }
      out += row + "\n";
    }
    return { out, flips, subject };
  }, { t, W, H, mutate });
  console.log(`\n=== t=${t}  [${label}]  facet-flips=${res.flips} subject=${res.subject} ===`);
  console.log(res.out);
}

// baseline (current look)
await snap(22, "BASELINE: flatShading true, roughness 0.14", null);

// Variant A: smooth shading
await snap(22, "A: flatShading=false (smooth normals)", () => {
  const m = window.__heartbeat.shellMat;
  m.flatShading = false;
  m.needsUpdate = true;
});

// Variant B: polish (lower roughness, higher clearcoat, no transmission)
await snap(22, "B: polished glass (rough 0.06, clearcoat 1, trans 0)", () => {
  const m = window.__heartbeat.shellMat;
  m.flatShading = false;
  m.needsUpdate = true;
  m.roughness = 0.06;
  m.metalness = 0.0;
  m.transmission = 0.0;
  m.clearcoat = 1.0;
  m.clearcoatRoughness = 0.1;
});

// Variant C: frosted gem (higher roughness, strong emissive, no trans)
await snap(22, "C: frosted gem (rough 0.45, emissive up, no trans)", () => {
  const m = window.__heartbeat.shellMat;
  m.flatShading = false;
  m.needsUpdate = true;
  m.roughness = 0.45;
  m.metalness = 0.0;
  m.transmission = 0.0;
  m.emissive.setHex(0x5a1a3a);
  m.emissiveIntensity = 1.2;
});

// Variant D: keep trans but lower, smooth
await snap(22, "D: trans 0.35 smooth (semi-frosted glass)", () => {
  const m = window.__heartbeat.shellMat;
  m.flatShading = false;
  m.needsUpdate = true;
  m.roughness = 0.2;
  m.transmission = 0.35;
  m.thickness = 1.4;
});
await browser.close();