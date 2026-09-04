import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

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
async function snap(t, label, fnName) {
  const buf = await page.evaluate(async ({ t, W, H, fn }) => {
    const h = window.__heartbeat;
    h.frame(t);
    const m = h.shellMat;
    m.flatShading = true; m.roughness = 0.06; m.metalness = 0; m.transmission = 0;
    m.clearcoat = 1; m.clearcoatRoughness = 0.1; m.emissive.setHex(0x3a0d24); m.emissiveIntensity = 0.12; m.needsUpdate = true;
    if (fn.includes("smooth")) { h.heartInfo.geometry.computeVertexNormals(); }
    if (fn.includes("rot34")) { h.heartGroup.rotation.y = 0.5; h.heartGroup.rotation.z = 0; }
    if (fn.includes("rotTilt")) { h.heartGroup.rotation.y = 0.45; h.heartGroup.rotation.z = 0.12; }
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
    // return full-res PNG bytes too
    return { out, flips, subject, png: canvas.toDataURL("image/png") };
  }, { t, W, H, fn: fnName });
  const pngPath = `${ROOT}/shots/mat_${fnName}.png`;
  writeFileSync(pngPath, Buffer.from(buf.png.split(",")[1], "base64"));
  console.log(`\n=== [${fnName}] flips=${buf.flips} subject=${buf.subject} (PNG: shots/mat_${fnName}.png) ===`);
  console.log(buf.out);
}

await snap(22, "polished", "polished");
await snap(22, "polished + smooth normals", "polished_smooth");
await snap(22, "polished + rotY .5 (3/4)", "polished_rot34");
await snap(22, "polished + rotY .45 tilt .12", "polished_tilt");
await browser.close();