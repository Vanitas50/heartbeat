import * as THREE from "three";
window.__THREE = THREE;
import { createHeartGeometry } from "./heart.js";
import { createShellMaterial, createAuraMaterial, enableFacetIgnition } from "./material.js";
import { createFormParticles, createDust } from "./particles.js";
import { createEnvironment } from "./environment.js";
import { createPost } from "./post.js";
import { createSequence } from "./sequence.js";
import { createSugarTwinkles, createSparks, createStar, createFlame, createRosePetals } from "./decor.js";
import { PALETTE, smoothRange, clamp } from "./art.js";

const app = document.getElementById("app");
const captionEl = document.getElementById("caption");
const bootEl = document.getElementById("boot");
const hintEl = document.getElementById("hint");
const messageEl = document.getElementById("message");
const startEl = document.getElementById("start");
const juliaEl = document.getElementById("julia");
const captionTextEl = document.getElementById("captionText");

// --- Adaptive quality: on phones we cut pixel count, bloom, particles and
// post overlays so the tab stays cool (fewer GPU stalls/crashes, less lag).
const isMobile =
  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && window.innerWidth < 900) ||
  window.matchMedia("(pointer: coarse)").matches;
const QUALITY = {
  isMobile,
  // NOTE: pixel ratio stays at 1.5 on mobile — 1.0 read as "blurry" to the user
  // (explicit feedback). Sharpness wins here; load is cut elsewhere (grain,
  // particles, bloom mips, safe-areas).
  pixelRatio: isMobile ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1.5),
  particles: isMobile ? 1800 : 3400,
  dust: isMobile ? 120 : 300,
  twinkles: isMobile ? 14 : 18,
  nMips: isMobile ? 3 : 5,
};

// The interaction hint must match the input the device actually has
hintEl.innerHTML = isMobile
  ? '<span class="k">drag</span> to look &nbsp;·&nbsp; <span class="k">pinch</span> to zoom'
  : '<span class="k">drag</span> to look &nbsp;·&nbsp; <span class="k">scroll</span> to zoom';

// --- Background music. Browsers block AUDIBLE autoplay until a user gesture —
// that's a hard platform rule, no site can bypass it. We try to start the
// moment the audio is loadable (works where the browser allows it, e.g. after
// a previous visit), and otherwise start on the very first interaction.
const bgm = document.getElementById("bgm");
// The song starts ONLY on the "touch" tap — no autoplay, not even muted,
// before the experience begins.
bgm.volume = 0.8;
let musicStarted = false;
function startMusic() {
  if (musicStarted) return;
  bgm.play().then(() => { musicStarted = true; }).catch(() => {});
}
// NOTE: no autoplay, no load-time start, no window-wide gesture listeners.
// The song starts ONLY when "touch" is tapped.
let started = false;
let languageSwapped = false;
function begin(e) {
  // NOTE: no preventDefault here — on iOS Safari it can break the audio
  // activation. Pull-to-refresh is already blocked by touch-action:none on #start.
  if (!musicStarted) startMusic(); // the tap is the user gesture → plays audible
  if (!started) {
    started = true;
    startEl.classList.add("hidden");
    tick(); // start the render loop now — no GPU drain behind the start screen
  }
}
startEl.addEventListener("pointerdown", begin);
startEl.addEventListener("touchstart", begin);
startEl.addEventListener("touchend", begin);
startEl.addEventListener("click", begin);

// --- Renderer
// NOTE: antialias stays on everywhere — turning it off on mobile made edges
// read as "unsauber" to the user (explicit feedback).
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// Phones read darker in daylight — lift the exposure a touch there
renderer.toneMappingExposure = isMobile ? 1.05 : 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// --- Scene & camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 220);
camera.position.set(7.4, 5.6, 17.5);
camera.lookAt(0, 0.3, 0);

const env = createEnvironment(scene, renderer);

// --- Heart
// Two geometries: a low-detail "cut-gem" shell (conscious large facets) and a
// smooth higher-detail volume for the aura + particle targets.
const heartInfo = createHeartGeometry(4, 1.0);
const gemInfo = createHeartGeometry(2, 1.0);
const shellMat = createShellMaterial();
enableFacetIgnition(shellMat);
const shell = new THREE.Mesh(gemInfo.geometry, shellMat);

const auraMat = createAuraMaterial();
const aura = new THREE.Mesh(heartInfo.geometry, auraMat);

const heartGroup = new THREE.Group();
heartGroup.add(shell, aura);
scene.add(heartGroup);
// The shell is transparent (fades in with materialize) — force draw order so the
// additive glows always render on top and the crystal still occludes particles.
shell.renderOrder = 0;
aura.renderOrder = 1;

// --- Lights
scene.add(new THREE.AmbientLight(0x1a0d1e, 0.7));
const keyLight = new THREE.PointLight(0xf09db8, 22, 20, 2);
keyLight.position.set(2.4, 2.6, 2.9);
const rimLight = new THREE.PointLight(0xffc39a, 18, 22, 2);
rimLight.position.set(-3.4, 1.4, -4.6);
const fillLight = new THREE.PointLight(0x8a70b0, 10, 18, 2);
fillLight.position.set(-2.7, -1.3, 3.4);
const dirLight = new THREE.DirectionalLight(0xffe0ec, 0.5);
dirLight.position.set(3, 4, 3);
scene.add(keyLight, rimLight, fillLight, dirLight);

// The camera orbits the heart after the intro; counter-rotate the key lights by
// the same angle so the hero lighting never drifts into a dark phase.
const lightBases = [keyLight, rimLight, fillLight, dirLight].map((l) => l.position.clone());
function applyOrbitLighting(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  [keyLight, rimLight, fillLight, dirLight].forEach((light, i) => {
    const b = lightBases[i];
    light.position.set(b.x * c - b.z * s, b.y, b.x * s + b.z * c);
  });
}

// --- Particles
const form = createFormParticles(QUALITY.particles, heartInfo.points);
heartGroup.add(form.points);
form.material.uniforms.uPixelRatio.value = QUALITY.pixelRatio;
const dust = createDust(QUALITY.dust);
scene.add(dust.points);
dust.material.uniforms.uPixelRatio.value = QUALITY.pixelRatio;
// Film grain is a full-screen blend on every frame — skip it on phones
if (isMobile) document.getElementById("grain").style.display = "none";

// --- Julia's baubles.
// The heart of the gift is #1 (amber core) + #2 (the message). Everything else
// is decoration that must whisper — toggle these back on one at a time.
const BAUBLES = {
  twinkles: true, // #3 rock-candy glints (tamed: few, quiet)
  sparks: false, // #6 amber "elektron" sparks — OFF (noise)
  star: false, // #7 wish star — OFF (noise)
  flame: false, // #9 candle flame — OFF (noise)
  petals: true, // #4 rose petals (tamed: few, finale only)
  hexagon: false, // #8 Wanda hexagon — OFF (noise)
};
const twinkles = BAUBLES.twinkles ? createSugarTwinkles(heartGroup, heartInfo.points, QUALITY.twinkles) : null;
const sparks = BAUBLES.sparks ? createSparks(heartGroup) : null;
const star = BAUBLES.star ? createStar(heartGroup) : null;
const flame = BAUBLES.flame ? createFlame(heartGroup) : null;
const petals = BAUBLES.petals ? createRosePetals(scene) : null;

// --- Post
const post = createPost(renderer, scene, camera, QUALITY.nMips);

// --- Sequence / state
const seq = createSequence();
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let clock = new THREE.Clock();
// Reduced motion: skip the cinematic intro and settle straight into the calm hero state.
let timeAcc = prefersReducedMotion ? 34 : 0;
let booted = false;

function applyFrame(t) {
  const s = seq.sample(t);

  // Brighten the early void through the whole opening (gather + materialize),
  // then settle — so the crystal never forms in the darkest moment.
  const exposureBase = isMobile ? 1.05 : 0.9;
  renderer.toneMappingExposure = exposureBase + 0.3 * (1 - smoothRange(s.time, 0, 30));

  // Heart rhythm — a gentle pulse, not a strobe
  const beatScale = 1 + 0.02 * s.beat;
  heartGroup.rotation.y = s.heartRotY;
  const sc = s.heartScale * beatScale;
  shell.scale.setScalar(sc);
  aura.scale.setScalar(sc * 1.012);

  // Materials — the crystal constructs itself as a wave of facets (tip -> lobes),
// each facet already glossy. Reflections stay fully on the whole time.
  const mat = s.materialize;
  shell.visible = true;
  shellMat.opacity = 1;
  shellMat.emissiveIntensity = 0.05 + s.beat * 0.03 + s.coreIntensity * 0.04;
  shellMat.color.setHSL(0.955, 0.5, 0.6 + s.beat * 0.012);
  const shellShader = shellMat.userData.shader;
  if (shellShader && shellShader.uniforms.uIgnite) {
    shellShader.uniforms.uIgnite.value = mat;
  }
  auraMat.uniforms.uIgnite.value = mat;
  auraMat.uniforms.uHex.value = BAUBLES.hexagon ? 1 : 0;

  auraMat.uniforms.uTime.value = t;
  auraMat.uniforms.uIntensity.value = s.auraIntensity;
  auraMat.uniforms.uWave.value = s.wave;
  auraMat.uniforms.uWaveTime.value = s.waveTime;
  auraMat.uniforms.uBeat.value = s.beat;
  auraMat.uniforms.uOpacity.value = mat;

  // Lights breathe with the pulse, gently — keep them aimed at the orbit phase
  applyOrbitLighting(s.orbitAngle);
  keyLight.intensity = 10 + s.beat * 4;
  rimLight.intensity = 10 + s.beat * 3;
  fillLight.intensity = 7 + s.beat * 2;
  dirLight.intensity = 0.35 + s.beat * 0.06;

  // Particles
  // Particles — the mote halo stays tight around the crystal while it
  // materializes, then settles as a close corona once the heart is complete.
  form.setTime(t);
  form.setFormation(s.formation);
  form.setOpacity(s.formOpacity);
  form.setHalo(1.12 + 0.08 * smoothRange(s.time, 14, 18) * (1.0 - smoothRange(s.time, 18, 22)));
  dust.setTime(t);
  dust.setOpacity(s.dustOpacity);
  env.setTime(t);
  env.setRayIntensity(s.rayIntensity);
  // The pink glow stays present during the reveal (dimmed to 30%), then comes
  // up to full at the hero — beautiful but never stealing the focus.
  env.setGlowScale(0.3 + 0.7 * smoothRange(s.time, 24, 30));
  env.setBackgroundGlow(0.07 + 0.1 * s.coreIntensity + 0.12 * s.auraIntensity);

  // Baubles — sugar twinkles once the crystal reads as done (~19s), rose petals
// drift through the very end of the finale.
  const whole = smoothRange(s.time, 19, 21);
  if (twinkles) {
    twinkles.setTime(t);
    twinkles.setShow(whole);
  }
  if (flame) {
    flame.setTime(t);
    flame.setShow(whole);
  }
  if (sparks) {
    sparks.setTime(t);
    sparks.setBurst(Math.pow(s.beat, 2.4));
    sparks.setShow(whole);
  }
  if (star) {
    star.setTime(t);
    star.setShow(smoothRange(s.time, 30, 33) * (1 - smoothRange(s.time, 46, 50)));
  }
  if (petals) {
    petals.setTime(t);
    petals.setShow(smoothRange(s.time, 42, 46));
  }

  // Camera — the sequence drives it until the viewer intervenes (drag/scroll),
  // after which the viewer orbits + zooms the heart freely.
  camera.position.copy(s.camPos);
  camera.lookAt(s.camLook);
  if (view.enabled) {
    applyView();
  }
  // Hint surfaces once the heart reads as formed (~19s), regardless of interaction
  if (s.time > 19 && !hintEl.classList.contains("show")) {
    hintEl.classList.add("show");
  }

  // Bloom
  post.setBloomStrength(s.bloom);

  // The personal message replaces the caption once the hero has settled; the
  // interaction hint has served its purpose and fades with it. The caption is
  // hidden instantly (no 3s cross-fade overlap with the message).
  if (s.time > 40 && !messageEl.classList.contains("visible")) {
    messageEl.classList.add("visible");
    juliaEl.classList.add("visible");
    captionEl.style.transition = "none";
    captionEl.classList.remove("visible");
    hintEl.classList.remove("show");
  } else if (s.caption > 0.4 && !captionEl.classList.contains("visible") && !messageEl.classList.contains("visible")) {
    captionEl.classList.add("visible");
  }
  // One language at a time over the arc: her Peru roots, then Korea, then the
  // finale — the swap cross-fades so it never snaps.
  if (!messageEl.classList.contains("visible") && s.time > 37 && !languageSwapped) {
    languageSwapped = true;
    captionTextEl.style.transition = "opacity 0.6s";
    captionTextEl.style.opacity = "0";
    setTimeout(() => {
      captionTextEl.textContent = "생일 축하해";
      captionTextEl.style.opacity = "1";
    }, 600);
  }
  return s;
}

function renderFrame(dt) {
  if (started) timeAcc += dt;
  const held = window.__timeHint;
  const t = typeof held === "number" ? held : timeAcc;
  applyFrame(t);
  post.render();
}

function tick() {
  rafId = requestAnimationFrame(tick);
  // dt capped at 0.1 (not 0.05) so a phone running ~10fps still plays in
  // real-time instead of the timeline crawling (time dilation).
  const dt = Math.min(clock.getDelta(), 0.1);
  renderFrame(typeof window.__timeHint === "number" ? 0 : dt);
}

let rafId = 0;

// The start screen shows a static t=0 frame; the RAF loop stays idle (no GPU
// drain) until begin() starts the experience.
function markBooted() {
  if (booted) return;
  booted = true;
  window.__ready = true;
  setTimeout(() => bootEl.classList.add("hidden"), 900);
}

// --- Interactive view (drag to look, scroll to zoom).
// The cinematic sequence keeps the camera until the viewer intervenes; from then
// on the viewer orbits + dollies around the heart while it still beats.
const lookTarget = new THREE.Vector3(0, 0.2, 0);
const view = { radius: 6.5, theta: 0, phi: 1.1, enabled: false };
let dragging = false;
let lastX = 0;
let lastY = 0;

function synchronizeViewFromCamera() {
  const d = new THREE.Vector3().subVectors(camera.position, lookTarget);
  view.radius = Math.max(2.0, d.length());
  view.phi = Math.acos(clamp(d.y / view.radius, -1, 1));
  view.theta = Math.atan2(d.z, d.x);
  view.enabled = true;
}

function applyView() {
  const sinP = Math.sin(view.phi) * view.radius;
  camera.position.set(
    lookTarget.x + sinP * Math.cos(view.theta),
    lookTarget.y + Math.cos(view.phi) * view.radius,
    lookTarget.z + sinP * Math.sin(view.theta)
  );
  camera.lookAt(lookTarget);
}

renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!view.enabled) synchronizeViewFromCamera();
    view.radius = clamp(view.radius * Math.exp(e.deltaY * 0.0013), 1.5, 20.0);
    hintEl.classList.remove("show");
  },
  { passive: false }
);

// Two-finger pinch to zoom on touch screens (wheel does the same on desktop)
const touchPoints = new Map();
let pinchDist = 0;

renderer.domElement.addEventListener("pointerdown", (e) => {
  touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touchPoints.size === 1) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  if (!view.enabled) synchronizeViewFromCamera();
  hintEl.classList.remove("show");
});
window.addEventListener("pointermove", (e) => {
  if (touchPoints.has(e.pointerId)) touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // pinch: two pointers change the zoom radius
  if (touchPoints.size === 2) {
    const pts = [...touchPoints.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist) view.radius = clamp(view.radius * (pinchDist / dist), 1.5, 20.0);
    pinchDist = dist;
    return;
  }
  if (!dragging) return;
  view.theta -= (e.clientX - lastX) * 0.005;
  view.phi = clamp(view.phi - (e.clientY - lastY) * 0.005, 0.32, 1.5);
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("pointerup", (e) => {
  touchPoints.delete(e.pointerId);
  pinchDist = 0;
  if (touchPoints.size === 0) dragging = false;
});
renderer.domElement.style.cursor = "grab";

// --- Resize
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const s = new THREE.Vector2();
  renderer.getDrawingBufferSize(s);
  post.setSize(s.x, s.y);
}
window.addEventListener("resize", onResize);

// Test hook for inspection / screenshot tooling.
window.__heartbeat = {
  seek(t) {
    window.__timeHint = t;
    renderFrame(0);
  },
  free() {
    delete window.__timeHint;
  },
  sample: (t) => seq.sample(t),
  renderer,
  post,
  scene,
  camera,
  heartGroup,
  shell,
  aura,
  heartInfo,
  shellMat,
  stop() {
    cancelAnimationFrame(rafId);
  },
  // render a single arbitrary frame with optional manual camera
  frame(t, fp, lp) {
    applyFrame(t);
    if (fp) {
      camera.position.copy(fp);
      if (lp) camera.lookAt(lp);
    }
    post.render();
  },
};

// Initially render the very dark start state immediately (shown behind the
// start screen). The RAF loop is NOT started here — begin() starts it, so the
// page is idle (no GPU drain) until the user taps "touch".
applyFrame(0);
post.render();

markBooted();
