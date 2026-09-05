import * as THREE from "three";
import { PALETTE } from "./art.js";

/**
 * Builds the dark, atmospheric stage:
 *  - a softly-lit procedural reflection environment (tinted toward the palette)
 *  - a deep radial background (infinite midnight feel)
 *  - a faint frosted fog matching the palette
 *  - extremely subtle drifting "light rays" (large, dim volumetric cones)
 */
export function createEnvironment(scene, renderer) {
  scene.background = new THREE.Color(PALETTE.deep);
  scene.fog = new THREE.FogExp2(0x070410, 0.032);

  // --- Procedural reflection environment, tinted with rose-gold / pink glows.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0a0710);

  const mkGlow = (color, intensity, x, y, z, size = 4) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: intensity, depthWrite: false })
    );
    m.position.set(x, y, z);
    envScene.add(m);
    return m;
  };
  // Bright rectangular softboxes — crisp, structured reflections (softbox
  // edges) that give the cut-gem facets real character instead of blobs.
  const mkSoftbox = (color, intensity, x, y, z, w, h, lookAt) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: intensity, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(lookAt);
    envScene.add(m);
    return m;
  };
const origin = new THREE.Vector3(0, 0, 0);
  mkGlow(0xe9a8c0, 0.55, 4, 3, 2); // soft pink key
  mkGlow(0xffcd9e, 0.5, -5, 1.5, -3); // warm rose-gold rim
  mkGlow(0xb44fc0, 0.35, 0, -4, 3); // magenta floor bounce
  mkGlow(0xe08aa8, 0.65, -2, 2.5, 2.5); // rose side fill (balanced)
  mkGlow(0xffffff, 0.3, 0.3, 1.2, 0.3, 1.2); // hot point highlight
  // Structured studio lights for the facets (balanced left/right so the
  // crystal's reflections stay symmetric and the reveal reads centered)
  mkSoftbox(0xffe0ec, 0.45, 6, 4.5, 4, 7, 5, origin); // warm key softbox (top-right)
  mkSoftbox(0xff9dbb, 0.6, -6, 2, 3.5, 5, 6, origin); // rose side softbox (left)
  mkSoftbox(0x8a5bd0, 0.35, 2, -3.5, -5, 5, 3.5, origin); // cool magenta low softbox

  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  envScene.clear();
  pmrem.dispose();

  // --- Deep radial background so the void recedes infinitely, never flat.
  const bgGeo = new THREE.SphereGeometry(60, 48, 48);
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x05030c) }, // faint violet-midnight
      uBottom: { value: new THREE.Color(0x010103) }, // near-black
      uGlow: { value: new THREE.Color(0x230820) }, // faint heart-infused center
      uTime: { value: 0 },
      uGlowScale: { value: 0 }, // 0 during the reveal so it never steals focus
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uBottom, uGlow;
      uniform float uTime, uGlowScale;
      varying vec3 vPos;

      float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

      void main(){
        vec3 dir = normalize(vPos);
        float h = dir.y * 0.5 + 0.5;
        vec3 c = mix(uBottom, uTop, h);

        // Several faint glow spots: each dims out, then reappears at a new
        // random position (staggered so it never feels busy). Gated by
        // uGlowScale so the drifting light never competes with the reveal.
        float total = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float cycle = 12.0;
          float ph = fract(uTime / cycle + fi * 0.37);
          float idx = floor(uTime / cycle + fi * 0.37);
          vec2 p = vec2(hash12(vec2(idx, fi)), hash12(vec2(idx, fi + 17.0))) * 2.2 - 1.1;
          float env = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.8, 1.0, ph));
          float spot = exp(-pow(length(dir.xy - p), 2.0) * 2.6) * (1.0 - abs(dir.y) * 0.8);
          total += spot * env;
        }
        c += uGlow * total * 0.05 * uGlowScale;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -2;
  scene.add(bg);

  // --- Faint, barely-visible volumetric "light rays" rising behind the heart.
  const raysGroup = new THREE.Group();
  const rayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        vUv = uv;
        vWorld = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float sway = 0.5 + 0.5*sin(uTime*0.3 + vUv.y*4.0);
        float a = edge * (0.05 + sway*0.03) * uIntensity;
        a *= smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
        vec3 col = vec3(0.6, 0.35, 0.75) * 0.6 + vec3(0.9, 0.5, 0.7) * 0.2;
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
  for (let i = 0; i < 7; i++) {
    const w = 0.18 + Math.random() * 0.3;
    const h = 7 + Math.random() * 8;
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, rayMat);
    const ang = Math.random() * Math.PI * 2;
    const rad = 4.5 + Math.random() * 4;
    m.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    m.lookAt(0, 0, 0);
    m.userData.sway = Math.random();
    raysGroup.add(m);
  }
  raysGroup.renderOrder = -1;
  scene.add(raysGroup);

  return {
    bgMat,
    rayMat,
    raysGroup,
    setTime(t) {
      rayMat.uniforms.uTime.value = t;
      bgMat.uniforms.uTime.value = t;
    },
    setGlowScale(v) {
      bgMat.uniforms.uGlowScale.value = v;
    },
    setRayIntensity(v) {
      rayMat.uniforms.uIntensity.value = v;
    },
    setBackgroundGlow(v) {
      const g = new THREE.Color(PALETTE.magenta).multiplyScalar(v);
      g.lerp(new THREE.Color(PALETTE.pink), 0.4);
      bgMat.uniforms.uGlow.value.copy(g);
    },
  };
}
