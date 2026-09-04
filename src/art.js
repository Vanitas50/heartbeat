// Shared palette, easing and math helpers for the heartbeat scene.

export const PALETTE = {
  pink: 0xffb6cf, // soft pink
  rose: 0xf7689c, // warm rose
  magenta: 0xd84fa6, // subtle magenta
  roseGold: 0xf0b087, // warm rose-gold
  cream: 0xffe3ce, // warm highlight
  deep: 0x05030a, // midnight background
  violet: 0x8a4dbf, // faint cool accent (used sparingly)
};

export const ColorStops = {
  dust: [0xffcfe0, 0xffb6d4, 0xffe7d6, 0xf7c7e0, 0xf0b087],
  sparks: [0xffe2ee, 0xffb6cf, 0xf7689c, 0xffd9b5, 0xe9c2ff],
};

export function hexToRGBA(hex, a = 1) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return [r / 255, g / 255, b / 255, a];
}

export function pickColor(stops, t) {
  // t in [0,1]; sample across a list of hex colors.
  const n = stops.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const mix = f - i;
  const a = new THREE.Color(stops[i]);
  const b = new THREE.Color(stops[i + 1]);
  a.lerp(b, mix);
  return a;
}

// --- Easing ---
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

// remap to [0,1]
export const range01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
// smoothstep between two edges -> returns 0 before a, 1 after b
export const smoothRange = (t, a, b) => {
  const x = range01(t, a, b);
  return x * x * (3 - 2 * x);
};

// A gentle, non-linear "organically" shaped heartbeat scalar in [0,1].
// Produces a subtle lub-dub (two bumps) per period, decaying quickly.
export function heartbeatPulse(time, period = 1.9) {
  const t = (time % period) / period; // 0..1
  const spread = 0.07;
  // two beats: second follows shortly after the first
  const b1 = Math.exp(-Math.pow((t - 0.12) / spread, 2)) * 0.55;
  const b2 = Math.exp(-Math.pow((t - 0.3) / spread, 2)) * 0.3;
  const base = 0.15; // resting hum so it never looks fully static
  return clamp(base + b1 + b2, 0, 1);
}

// A soft breathing drift in [-1,1] (slow sine)
export const breathe = (time, period = 11) => Math.sin((time / period) * Math.PI * 2);

// Small deterministic hash/noise for reproducible shapes
export const fract = (v) => v - Math.floor(v);
export function hash1(n) {
  return fract(Math.sin(n * 127.1) * 43758.5453);
}
export function hash3(x, y, z) {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453);
}
