import * as THREE from "three";

// Personal baubles for Julia's birthday heart — small, self-contained GLSL
// systems: rock-candy sugar twinkles, amber spark bursts (the "electron" in
// her amber eyes), the wish star, the birthday candle flame, and rose petals.

const PR = Math.min(window.devicePixelRatio || 1, 1.5);

// ---------------------------------------------------------------------------
// #3 Rock-candy sugar twinkles: tiny glitter that flickers on the facets.
// Tamed: few, small, quiet — decoration must whisper.
export function createSugarTwinkles(parent, points, count = 18) {
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 2);
  const tN = points.length / 3;
  // Balanced placement: half the twinkles on the right half of the heart,
  // half on the left — so the glitter never clusters to one side.
  const right = [];
  const left = [];
  for (let i = 0; i < tN; i++) {
    if (points[i * 3] >= 0) right.push(i);
    else left.push(i);
  }
  for (let i = 0; i < count; i++) {
    const pool = i < count / 2 ? right : left;
    const si = pool[(Math.random() * pool.length) | 0];
    pos[i * 3 + 0] = points[si * 3 + 0];
    pos[i * 3 + 1] = points[si * 3 + 1];
    pos[i * 3 + 2] = points[si * 3 + 2];
    data[i * 2 + 0] = Math.random();
    data[i * 2 + 1] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aData", new THREE.BufferAttribute(data, 2));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 }, uPixelRatio: { value: PR } },
    vertexShader: /* glsl */ `
      attribute vec2 aData;
      uniform float uTime, uShow, uPixelRatio;
      varying float vAlpha;
      varying vec3 vColor;
      float hash11(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float seed = aData.x;
        float frq = 1.5 + aData.y * 6.0;
        float tw = pow(0.5 + 0.5 * sin(uTime * frq + seed * 40.0), 6.0) * 0.6;
        // rare, irregular sparkles — each on its own slow per-glint cycle,
        // with random skips so the twinkling never falls into a fixed rhythm
        float gcyc = floor(uTime * 0.25 + seed * 77.0);
        float gph = fract(uTime * 0.25 + seed * 77.0);
        float glint = step(hash11(gcyc + seed * 13.0), 0.3) * smoothstep(0.85, 1.0, gph);
        float a = (0.05 + 0.4 * max(tw, glint)) * uShow;
        vAlpha = a;
        vColor = mix(vec3(1.0, 0.88, 0.62), vec3(1.0, 0.72, 0.85), seed);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sz = (1.2 + aData.y * 1.6) * uPixelRatio * (0.4 + max(tw, glint) * 1.4);
        gl_PointSize = sz / max(0.1, -mv.z) * 2.6;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      void main(){
        if (vAlpha <= 0.01) discard;
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv);
        float cross = pow(max(0.0, 1.0 - abs(uv.x) * 4.0), 2.0) + pow(max(0.0, 1.0 - abs(uv.y) * 4.0), 2.0);
        float d = 1.0 - smoothstep(0.0, 0.5, r);
        float s = max(d, cross * 0.9);
        gl_FragColor = vec4(vColor * s * vAlpha * 1.4, s * vAlpha);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  parent.add(pts);
  return {
    setTime(t) { mat.uniforms.uTime.value = t; },
    setShow(v) { mat.uniforms.uShow.value = v; },
  };
}

// ---------------------------------------------------------------------------
// #6 Amber sparks ("Elektron") — a spark leap from the core on every heartbeat.
export function createSparks(parent) {
  const count = 90;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3 + 0] = Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * 0.7;
    pos[i * 3 + 2] = Math.cos(ph);
    seed[i * 3 + 0] = Math.random();
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBurst: { value: 0 }, uShow: { value: 0 }, uPixelRatio: { value: PR } },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime, uBurst, uShow, uPixelRatio;
      varying float vA;
      varying vec3 vC;
      void main(){
        vec3 dir = normalize(position);
        float r = 0.16 + aSeed.x * 0.3;
        // burst drives a short radial leap, then settles back
        vec3 p = dir * r + dir * uBurst * 0.85;
        float a = uBurst * (0.5 + aSeed.y * 0.5) * uShow;
        vA = a;
        vC = mix(vec3(1.0, 0.66, 0.34), vec3(1.0, 0.95, 0.7), aSeed.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.2 + aSeed.y * 3.0) * uPixelRatio * (0.4 + uBurst * 2.2) / max(0.1, -mv.z) * 3.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vC;
      void main(){
        if (vA <= 0.01) discard;
        float d = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vC * d * vA * 1.8, d * vA);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  parent.add(pts);
  return {
    setTime(t) { mat.uniforms.uTime.value = t; },
    setBurst(v) { mat.uniforms.uBurst.value = v; },
    setShow(v) { mat.uniforms.uShow.value = v; },
  };
}

// ---------------------------------------------------------------------------
// #7 The wish star — a bright twinkling star above the heart.
export function createStar(parent) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uShow;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float glow = exp(-length(p) * 2.6);
        float star = pow(max(0.0, 1.0 - abs(p.x) * 2.2), 3.0) + pow(max(0.0, 1.0 - abs(p.y) * 2.2), 3.0);
        float twinkle = 0.65 + 0.35 * sin(uTime * 2.2);
        float s = max(glow, star * 1.6) * twinkle * uShow;
        vec3 c = mix(vec3(1.0, 0.92, 0.78), vec3(1.0, 0.8, 0.9), 0.3);
        gl_FragColor = vec4(c * s * 1.8, s);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.set(0, 3.4, 0);
  mesh.scale.setScalar(0.55);
  mesh.frustumCulled = false;
  parent.add(mesh);
  return {
    setTime(t) { mat.uniforms.uTime.value = t; },
    setShow(v) { mat.uniforms.uShow.value = v; },
  };
}

// ---------------------------------------------------------------------------
// #9 Birthday candle flame on the heart's tip.
export function createFlame(parent) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uShow;
      varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        uv.x -= 0.5;
        float h = uv.y; // 0 bottom, 1 top
        float wob = 0.5 + 0.5 * sin(uTime * 12.0 + h * 7.0 + sin(uTime * 7.3));
        float w = (0.14 + 0.08 * wob) * (1.0 - h);
        float body = 1.0 - smoothstep(w * 0.35, w, abs(uv.x));
        float core = 1.0 - smoothstep(w * 0.12, w * 0.3, abs(uv.x));
        float tip = 1.0 - smoothstep(0.72, 1.0, h);
        float a = body * tip * uShow;
        vec3 c = mix(vec3(1.0, 0.52, 0.18), vec3(1.0, 0.95, 0.72), core);
        c += vec3(1.0, 0.75, 0.4) * pow(core, 2.0) * 0.5;
        gl_FragColor = vec4(c * a * 1.5, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.set(0, -1.35, 0);
  mesh.scale.setScalar(0.42);
  mesh.frustumCulled = false;
  parent.add(mesh);
  return {
    setTime(t) { mat.uniforms.uTime.value = t; },
    setShow(v) { mat.uniforms.uShow.value = v; },
  };
}

// ---------------------------------------------------------------------------
// #4 Rose petals — soft pink falling petals drifting through the space.
// Tamed: few, slow, only visible in the finale.
export function createRosePetals(scene) {
  const count = 12;
  const start = new Float32Array(count * 3);
  const data = new Float32Array(count * 4); // seed, size, sway, spin
  for (let i = 0; i < count; i++) {
    const r = 5 + Math.random() * 7;
    const th = Math.random() * Math.PI * 2;
    start[i * 3 + 0] = Math.cos(th) * r;
    start[i * 3 + 1] = 6 + Math.random() * 8;
    start[i * 3 + 2] = Math.sin(th) * r;
    data[i * 4 + 0] = Math.random();
    data[i * 4 + 1] = 0.4 + Math.random() * 0.5;
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aData", new THREE.BufferAttribute(data, 4));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uShow: { value: 0 }, uPixelRatio: { value: PR } },
    vertexShader: /* glsl */ `
      attribute vec4 aData;
      uniform float uTime, uShow, uPixelRatio;
      varying float vAlpha;
      varying vec2 vLocal;
      void main(){
        float seed = aData.x;
        float size = aData.y;
        // slow falling + gentle sway
        float fall = mod(uTime * (0.5 + seed * 0.7) + seed * 12.0, 16.0);
        vec3 p = position;
        p.y = 6.0 - fall;
        p.x += sin(uTime * 0.4 + seed * 6.283) * 0.8;
        p.z += cos(uTime * 0.33 + seed * 6.283) * 0.8;
        vAlpha = uShow * (0.15 + 0.3 * smoothstep(0.0, 1.5, fall)) * (1.0 - smoothstep(13.5, 15.5, fall));
        vLocal = vec2(cos(aData.w * 6.283 + uTime), sin(aData.w * 6.283 + uTime));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (size * 26.0) * uPixelRatio / max(0.1, -mv.z) * 1.4;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec2 vLocal;
      void main(){
        if (vAlpha <= 0.01) discard;
        vec2 uv = gl_PointCoord - 0.5;
        // petal: round-ish with a notch at one end
        float petal = 1.0 - smoothstep(0.2, 0.5, length(uv));
        petal *= 0.7 + 0.3 * sin((uv.y - uv.x) * 6.0);
        vec3 c = mix(vec3(1.0, 0.55, 0.75), vec3(1.0, 0.8, 0.9), uv.x + 0.5);
        gl_FragColor = vec4(c * petal * vAlpha * 0.8, petal * vAlpha * 0.5);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  scene.add(pts);
  return {
    setTime(t) { mat.uniforms.uTime.value = t; },
    setShow(v) { mat.uniforms.uShow.value = v; },
  };
}