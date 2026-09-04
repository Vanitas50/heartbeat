// Headless capture of the heartbeat scene at several timestamps for inspection.
// Usage: node tools/screenshot.mjs  (expects `npm run dev` to be running on 5173,
//      or it will start it itself)
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "shots");
mkdirSync(SHOTS, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 5173;
const URL = `http://127.0.0.1:${PORT}/`;
const TIMES = [1, 6, 11, 15, 18, 21, 26, 34, 50];

let server;
async function ensureServer() {
  const up = await fetch(URL, { method: "HEAD" }).then(() => true).catch(() => false);
  if (up) return;
  server = spawn("npx", ["vite"], { cwd: ROOT, stdio: "pipe" });
  await new Promise((res, rej) => {
    server.stdout.on("data", (d) => {
      if (String(d).includes("Local")) res();
    });
    server.on("error", rej);
    setTimeout(res, 6000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await ensureServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--use-angle=metal",
      "--window-size=1600,1000",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction("window.__ready === true", { timeout: 20000 }).catch(() => {});
  // hide the boot + start overlays so they never cover the art
  await page.evaluate(() => {
    for (const id of ["boot", "start", "vignette", "grain"]) document.getElementById(id)?.classList.add("hidden");
  }).catch(() => {});

  await sleep(600);

  for (const t of TIMES) {
    await page.evaluate((tt) => window.__heartbeat.seek(tt), t);
    await sleep(120);
    const name = `shot_${String(t).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(SHOTS, name) });
    console.log("captured", name, "(t=" + t + ")");
  }

  if (errors.length) {
    console.log("\n=== RUNTIME ERRORS ===");
    for (const e of errors) console.log(" -", e);
  } else {
    console.log("\nNo runtime errors.");
  }

  await browser.close();
  if (server) server.kill();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
