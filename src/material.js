import * as THREE from "three";

// The heart is rendered as two co-located volumes:
//   1. A polished, cut-gem crystal shell (MeshPhysicalMaterial, NO transmission —
//      coherent env reflections instead of per-facet refracted noise).
//   2. A luminous, additive "aura" volume inside it that carries the internal
//      light, the fresnel rim glow and the traveling wave of light.

export function createShellMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe79ab8,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    emissive: 0x2b0a1d,
    emissiveIntensity: 0.12,
    envMapIntensity: 1.2,
    flatShading: true,
    specularIntensity: 0.85,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
}

// GLSL tri-axial value noise (cheap) for organic variation in the aura.
const NOISE = /* glsl */ `
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

// Makes the crystal shell build itself as a wave of facets: each face carries a
// per-face `aOrder` attribute (tip -> lobes) and fades in softly as uIgnite
// passes its order. Reflections stay fully on, so every facet appears glossy
// the moment it materializes.
export function enableFacetIgnition(material) {
  material.customProgramCacheKey = () => "shell-facet-ignition";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIgnite = { value: 0 };
    shader.vertexShader =
      "attribute float aOrder;\nvarying float vOrder;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "vOrder = aOrder;\n#include <begin_vertex>"
    );
    shader.fragmentShader =
      "uniform float uIgnite;\nvarying float vOrder;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "float ign = 1.0 - smoothstep(uIgnite, uIgnite + 0.16, vOrder);\n" +
        "diffuseColor.a *= ign;\n" +
        "if (ign < 0.001) discard;\n#include <opaque_fragment>"
    );
    material.userData.shader = shader;
  };
  return material;
}

export function createAuraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0xef9ec0) }, // muted rose
      uColorB: { value: new THREE.Color(0xe29cb4) }, // dusty rose
      uColorC: { value: new THREE.Color(0xffd7b0) }, // rose-gold highlight
      uMagenta: { value: new THREE.Color(0x8f6aa8) }, // dusty violet accent
      uIntensity: { value: 0.0 }, // master aura intensity (sequence driven)
      uWave: { value: 0.0 }, // traveling wave strength
      uWaveTime: { value: 0.0 }, // wave sweep position
      uBeat: { value: 0.0 }, // heartbeat 0..1
      uRadius: { value: 1.0 },
      uOpacity: { value: 1.0 },
      uIgnite: { value: 1.0 }, // facet-construction wave (0..1)
      uHex: { value: 0 }, // Wanda hexagon lattice (0 = off)
    },
    vertexShader: /* glsl */ `
      attribute float aOrder;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vOrder;
      void main(){
        vOrder = aOrder;
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA, uColorB, uColorC, uMagenta;
      uniform float uTime, uIntensity, uWave, uWaveTime, uBeat, uRadius, uOpacity, uIgnite, uHex;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vOrder;
      ${NOISE}
      void main(){
        vec3 n = normalize(vNormal);
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(n, view)), 2.2);

        // internal fuzz near the centre -> a soft core of light
        float glow = smoothstep(0.75, 0.0, length(vLocal) / uRadius) * 0.55;

        // traveling wave of light sweeping along the heart (bottom -> top)
        float band = exp(-pow((vLocal.y + uWaveTime) / 0.28, 2.0));
        float waveGlow = band * uWave;

        // breathing life + a constant soft internal luminosity (the "alive" body)
        float life = fbm(vLocal * 2.6 + vec3(0.0, -uTime * 0.15, 0.0));
        float pulse = 0.5 + 0.5 * life;
        float body = 0.3 * (0.45 + 0.55 * pulse);

        // faint Wanda hexagon lattice in the local plane — only visible up close
        vec2 hx = vLocal.xy * 2.0 / 0.5;
        vec2 hb = vec2(dot(hx, vec2(1.0, 0.0)), dot(hx, vec2(0.5, 0.866)));
        vec2 hf = vec2(fract(hb.x), fract(hb.y)) - 0.5;
        float hexLine = 1.0 - smoothstep(0.42, 0.5, length(hf));
        vec3 hexCol = mix(vec3(0.72, 0.42, 0.9), vec3(1.0, 0.8, 0.5), 0.4);

        vec3 col = mix(uColorB, uColorA, pulse);
        col = mix(col, uColorC, fres * 0.6);
        col = mix(col, uMagenta, smoothstep(0.55, 1.0, fres) * 0.45);
        col = mix(col, hexCol, hexLine * uHex * 0.05);

        // only glow where the facets have already been constructed
        float ign = 1.0 - smoothstep(uIgnite, uIgnite + 0.16, vOrder);

        float a = (fres * 0.9 + glow * 0.6 + body + waveGlow * 1.3) * (0.55 + uBeat * 0.3);
        a *= ign;
        a *= uIntensity * uOpacity * 0.85;

        gl_FragColor = vec4(col * a, a * 0.9);
      }
    `,
  });
}

export function createCoreMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xffc15e) }, // warm amber — Julia's eyes
      uIntensity: { value: 0.0 },
      uBeat: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main(){
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity, uBeat;
      varying vec3 vLocal;
      void main(){
        float d = length(vLocal);
        float core = exp(-d * d * 5.0);
        float c = core * (0.75 + uBeat * 0.6);
        gl_FragColor = vec4(uColor * c * uIntensity, c * uIntensity * 0.85);
      }
    `,
  });
}
