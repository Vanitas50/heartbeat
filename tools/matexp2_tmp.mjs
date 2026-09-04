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
async function snap(t, label, variantIdx) {
  const res = await page.evaluate(async ({ t, W, H, v }) => {
    const h = window.__heartbeat;
    h.frame(t);
    const m = h.shellMat;
    // reset to baseline
    m.flatShading = true; m.roughness = 0.14; m.metalness = 0.05; m.transmission = 0.64;
    m.thickness = 1.0; m.clearcoat = 0.8; m.clearcoatRoughness = 0.22;
    m.emissive.setHex(0x3a0d24); m.emissiveIntensity = 0.12; m.needsUpdate = true;
    if (v === 1) { m.flatShading = false; m.needsUpdate = true; }                 // smooth
    if (v === 2) { m.flatShading = false; m.roughness = 0.06; m.metalness = 0; m.transmission = 0; m.clearcoat = 1; m.clearcoatRoughness = 0.1; m.needsUpdate = true; }
    if (v === 3) { m.flatShading = false; m.roughness = 0.45; m.metalness = 0; m.transmission = 0; m.emissive.setHex(0x5a1a3a); m.emissiveIntensity = 1.4; m.needsUpdate = true; }
    if (v === 4) { m.flatShading = false; m.roughness = 0.2; m.transmission = 0.35; m.thickness = 1.4; m.needsUpdate = true; }
    h.post.render();
    const canvas = h.renderer.domElement;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.drawImage(canvas, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    let out = ""; let flips = 0; let subject = 0;
    for (let y = 0; y < H; y++) {
      let row = ""; let prev = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        let ch = " ";
        if (lum > 0.10 && lum <= 0.20) ch = ".";
        if (lum > 0.20 && lum <= 0.35) ch = "o";
        if (lum > 0.35 && lum <= 0.55) ch = "P";
        if (lum > 0.55) ch = "W";
        row += ch;
        if (lum > 0.10) { subject++; const b2 = lum > 0.35 ? 1 : 0; if (x > 0 && b2 !== prev) flips++; prev = b2; }
      }
      out += row + "\n";
    }
    return { out, flips, subject };
  }, { t, W, H, v: variantIdx });
  console.log(`\n=== t=${t} [${label}] flips=${res.flips} subject=${res.subject} ===`);
  console.log(res.out);
}

await snap(22, "BASELINE flat + rough 0.14 + trans 0.64", 0);
await snap(22, "A: smooth shading", 1);
await snap(22, "B: polished (rough .06 clearcoat 1, no trans)", 2);
await snap(22, "C: frosted gem (rough .45 emissive, no trans)", 3);
await snap(22, "D: semi-frosted (trans .35 smooth)", 4);
await browser.close();