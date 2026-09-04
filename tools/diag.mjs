import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args:["--no-sandbox","--disable-dev-shm-usage","--ignore-gpu-blocklist","--enable-webgl","--use-angle=metal"] });
const page = await browser.newPage();
page.on("pageerror", e => console.log("[pageerror]", e.message, "\n", e.stack));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r=>setTimeout(r,1200));
console.log("__ready:", await page.evaluate(()=>window.__ready));
await browser.close();
