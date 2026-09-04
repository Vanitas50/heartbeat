import * as THREE from "three";
import { ColorStops } from "./art.js";

const GLSL_NOISE = /* glsl */ `
  float hash13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise3(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash13(i+vec3(0,0,0)), hash13(i+vec3(1,0,0)), f.x),
                   mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                   mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<4;i++){ v += a*noise3(p); p = p*2.03 + 11.3; a *= 0.5; }
    return v;
  }
`;

// A soft round sprite without a texture (radial falloff in the fragment shader).
const SOFT_DOT = /* glsl */ `
  float dotRadius(vec2 uv){ return 1.0 - smoothstep(0.0, 0.5, length(uv-0.5)); }
`;

function buildStartField(count, spread) {
  const start = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // biased shell so particles cluster loosely around the future heart; the
    // gentler power keeps more motes out in the void for a full-screen gather
    const r = Math.pow(Math.random(), 1.2) * spread;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    start[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
    start[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.8;
    start[i * 3 + 2] = r * Math.cos(ph);
  }
  return start;
}

/**
 * Creates the "forming" particle field: motes that drift in from a void, gather
 * around a point, condense onto the heart surface, then orbit it gently.
 * @param {number} count
 * @param {Float32Array} targetPoints heart surface points (as Vector3 triplets)
 * @returns {{points:THREE.Points, setTime:Function, setFormation:Function, setOpacity:Function, material:THREE.ShaderMaterial}}
 */
export function createFormParticles(count, targetPoints) {
  const start = buildStartField(count, 9.0);
  const target = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const drift = new Float32Array(count);

  const tN = targetPoints.length / 3;
  const c = new THREE.Color();
  const temp = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const si = (Math.random() * tN) | 0;
    target[i * 3 + 0] = targetPoints[si * 3 + 0];
    target[i * 3 + 1] = targetPoints[si * 3 + 1];
    target[i * 3 + 2] = targetPoints[si * 3 + 2];

    // seed, size, alphaBase, hueMix
    data[i * 4 + 0] = Math.random(); // seed
    data[i * 4 + 1] = 0.55 + Math.random() * 0.45; // size factor
    data[i * 4 + 2] = 0.35 + Math.random() * 0.65; // alpha base
    data[i * 4 + 3] = Math.random(); // hue mix

    const hue = data[i * 4 + 3];
    const stops = hue < 0.5 ? ColorStops.sparks : ColorStops.dust;
    const n = stops.length - 1;
    const fT = Math.min(hue, 1) * n;
    const i0 = Math.min(Math.floor(fT), n - 1);
    c.copy(new THREE.Color(stops[i0]).lerp(new THREE.Color(stops[i0 + 1]), fT - i0));
    // a few brighter, cool-tinted "shooting fragments"
    const bright = Math.random();
    c.multiplyScalar(0.55 + bright * 0.75);
    color[i * 3 + 0] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;

    drift[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
  geometry.setAttribute("aData", new THREE.BufferAttribute(data, 4));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drift, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uFormation: { value: 0 },
      uOpacity: { value: 1 },
      uHalo: { value: 1.12 },
      uSize: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTarget;
      attribute vec4 aData;
      attribute vec3 aColor;
      attribute float aDrift;
      uniform float uTime, uFormation, uOpacity, uSize, uPixelRatio, uHalo;
      varying float vAlpha;
      varying vec3 vColor;
      ${GLSL_NOISE}
      void main(){
        float seed = aData.x;
        float sizeF = aData.y;
        float alphaB = aData.z;
        float hue = aData.w;

        float f = uFormation*uFormation*(3.0-2.0*uFormation);
        // Motes appear (scattered) at staggered times, drift in, gather.
        // Visibility is decoupled from formation so the void fills first.
        float appear = smoothstep(0.6 + seed*1.8, 2.4 + seed*1.8, uTime);

        // grow into a soft halo around the crystal (not a coating on its surface)
        vec3 tgt = aTarget * uHalo;

        // core drift target -> halo position
        vec3 p = mix(position, tgt, f);

        // coherent turbulence -> subtle streams / filaments
        vec3 q = p*1.6 + vec3(seed*9.0, -uTime*0.2, seed*7.0);
        float n = fbm(q)*0.5 - 0.25;
        p += normalize(tgt + 0.001) * n * 0.22;
        p += vec3(n*0.5, n*0.35, n*0.8) * 0.12;

        // gentle orbit around the heart (tangential swirl)
        float ang = uTime*(0.15 + seed*0.3) + seed*6.2831;
        float orb = (0.07 + n*0.05) * f;
        p += vec3(cos(ang)*orb, sin(ang*0.9)*orb*0.7, sin(ang)*orb*0.8);

        // occasional detach: a subset drifts away and fades. Each mote has its own
        // long, irregular cycle (per-particle period + random skips) so the
        // pattern never reads as a metronomic rhythm
        float period = 0.04 + aDrift * 0.16; // ~25s..50s per mote
        float cycleIdx = floor(uTime * period + aDrift * 53.0);
        float ph = fract(uTime * period + aDrift * 53.0);
        float skip = step(hash13(vec3(cycleIdx, aDrift, 9.71)), 0.4); // only ~40% of cycles detach
        float det = smoothstep(0.8, 1.0, ph) * skip * step(aDrift, 0.3);
        p += (p + 0.4)*det*1.6;
        float detFade = 1.0 - det;

        float alpha = alphaB * appear * uOpacity * detFade * 1.15 * (0.75 + 0.55*(1.0-f));
        vAlpha = alpha;
        vColor = aColor;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (sizeF * uSize * 52.0) * uPixelRatio / max(0.1, -mv.z) * (1.25 - 0.25*f) * 1.6;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      ${SOFT_DOT}
      void main(){
        if(vAlpha <= 0.001) discard;
        vec2 uv = gl_PointCoord;
        float d = dotRadius(uv);
        float core = 1.0 - smoothstep(0.0, 0.28, length(uv-0.5));
        vec3 col = vColor * (0.55 + core*0.9);
        gl_FragColor = vec4(col * d * vAlpha, d * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  return {
    points,
    material,
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setFormation(v) {
      material.uniforms.uFormation.value = v;
    },
    setOpacity(v) {
      material.uniforms.uOpacity.value = v;
    },
    setHalo(v) {
      material.uniforms.uHalo.value = v;
    },
  };
}

// Ambient dust — the faint, mostly-static motes that give the air a body.
export function createDust(count = 260) {
  const spread = 16;
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const data = new Float32Array(count * 2);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 0.8) * spread;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.9;
    pos[i * 3 + 2] = r * Math.cos(ph);
    data[i * 2 + 0] = Math.random(); // seed
    data[i * 2 + 1] = Math.random(); // size
    const stops = Math.random() < 0.5 ? ColorStops.dust : ColorStops.sparks;
    const t = Math.random();
    const n = stops.length - 1;
    const f = Math.min(t, 1) * n;
    const i0 = Math.min(Math.floor(f), n - 1);
    c.copy(new THREE.Color(stops[i0]).lerp(new THREE.Color(stops[i0 + 1]), f - i0));
    c.multiplyScalar(0.5 + Math.random() * 0.5);
    color[i * 3 + 0] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("aData", new THREE.BufferAttribute(data, 2));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSize: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec2 aData;
      uniform float uTime, uOpacity, uSize, uPixelRatio;
      varying float vAlpha;
      varying vec3 vColor;
      ${GLSL_NOISE}
      void main(){
        vec3 p = position;
        float seed = aData.x;
        // very slow billowing drift
        float n = fbm(p*0.35 + vec3(0.0, uTime*0.05, seed*4.0));
        p += vec3(n*0.5, n*0.4 + sin(uTime*0.06 + seed*6.28)*0.3, n*0.5);
        vColor = aColor;
        vAlpha = uOpacity * (0.3 + 0.7*smoothstep(0.0,0.9,sin(uTime*0.05 + seed*20.0+1.0)))
                 * (1.0 - smoothstep(5.5, 12.0, length(position)));
        float sz = aData.y * uSize * 40.0 * uPixelRatio;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = sz / max(0.1, -mv.z) * 0.8;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      ${SOFT_DOT}
      void main(){
        if(vAlpha <= 0.002) discard;
        float d = dotRadius(gl_PointCoord);
        gl_FragColor = vec4(vColor * d * vAlpha * 0.8, d * vAlpha * 0.6);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;

  return {
    points,
    material,
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setOpacity(v) {
      material.uniforms.uOpacity.value = v;
    },
  };
}
