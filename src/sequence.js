import * as THREE from "three";
import { smoothRange, easeOutExpo, lerp, clamp, heartbeatPulse } from "./art.js";

// The scene performs a one-act, self-contained story, then settles into a
// calm, elegant ongoing state (gentle orbital drift + an organic heartbeat).
// Every showable parameter is authored here as a function of time and exposed
// through sample(); main.js only applies values. Keeping the choreography in
// one module makes the whole piece trivially tunable.

const INTRO = 33; // seconds until the "hero" composition is fully reached

// Scalar channel sampler — smooth interpolation between authored keyframes.
function chan(keys) {
  return function (t) {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i];
      const [t1, v1] = keys[i + 1];
      if (t >= t0 && t <= t1) {
        const u = smoothRange(t, t0, t1);
        return lerp(v0, v1, u);
      }
    }
    return keys[keys.length - 1][1];
  };
}

export function createSequence() {
  // --- Particle / heart formation channels.
  // The particle heart outline is fully formed first (formation -> 1 by ~14s);
  // only then does the crystal slowly condense from it, so it never "pops".
  const formOpacity = chan([[0, 0], [2, 0], [6, 1.06], [30, 0.8], [60, 0.8]]);
  const dustOpacity = chan([[0, 0], [1.5, 0], [5.5, 0.6], [11, 0.85], [28, 0.6], [60, 0.5]]);
  const rayIntensity = chan([[0, 0], [3, 0], [12, 0.55], [28, 0.4], [60, 0.35]]);
  const formation = chan([[0, 0], [4, 0], [8, 0.25], [17, 1], [40, 1]]);
  // The crystal does NOT inflate: it materializes in place at full scale, fading
  // in as a luminous volume once the particles have fully sketched it.
  const heartScale = chan([[0, 1], [60, 1]]);
  const materialize = chan([[0, 0], [18, 0], [24, 1], [60, 1]]);
  const heartRotY = chan([[0, 0], [24, 0], [30, 0.5], [37, 0.7], [60, 0.7]]);
  const auraIntensity = chan([[0, 0], [12, 0], [15, 0.22], [18, 0.72], [22, 0.85], [30, 0.72], [60, 0.66]]);
  const coreIntensity = chan([[0, 0], [13, 0], [16, 0.12], [18, 0.75], [30, 0.5], [60, 0.45]]);
  const bloom = chan([[0, 0.16], [8, 0.28], [16, 0.4], [24, 0.5], [30, 0.42], [60, 0.38]]);
  const beatEnv = chan([[0, 0], [27, 0], [30, 1], [37, 1], [60, 1]]);

  // --- Camera path. The camera arrives, then HOLDS still (duplicate control
  // points 19s/25s) while the particle cloud slowly gathers and the crystal
  // materializes — no camera motion during the build.
  const camPoints = [
    new THREE.Vector3(7.4, 5.6, 17.5), // 0  — far, dark
    new THREE.Vector3(5.6, 4.4, 13.4), // 5  — particles emerge
    new THREE.Vector3(3.6, 3.0, 9.8), // 10 — gathering
    new THREE.Vector3(2.85, 2.15, 7.4), // 19 — arrive, camera frozen during build
    new THREE.Vector3(2.85, 2.15, 7.4), // 25 — (duplicate -> hold)
    new THREE.Vector3(2.75, 1.7, 6.4), // 31 — settle into hero
    new THREE.Vector3(2.75, 1.7, 6.4), // INTRO+3 — hold hero until pull-back
  ];
  const camTimes = [0, 5, 10, 19, 25, 31, INTRO + 3];
  const camCurve = new THREE.CatmullRomCurve3(camPoints, false, "centripetal");

  const lookA = [
    new THREE.Vector3(0, 0.34, 0),
    new THREE.Vector3(0, 0.28, 0),
    new THREE.Vector3(0, 0.2, 0),
    new THREE.Vector3(0, 0.22, 0),
    new THREE.Vector3(0, 0.22, 0),
    new THREE.Vector3(0, 0.24, 0),
    new THREE.Vector3(0, 0.2, 0),
  ];
  const lookCurve = new THREE.CatmullRomCurve3(lookA, false, "centripetal");

  function sampleCam(t) {
    // Map a continuous time to a u along the intro path.
    const introU = (() => {
      if (t <= camTimes[0]) return 0;
      if (t >= camTimes[camTimes.length - 1]) return 1;
      for (let i = 0; i < camTimes.length - 1; i++) {
        if (t >= camTimes[i] && t <= camTimes[i + 1]) {
          const u = smoothRange(t, camTimes[i], camTimes[i + 1]);
          return (i + u) / (camTimes.length - 1);
        }
      }
      return 1;
    })();
    const introPos = camCurve.getPoint(introU);
    const introLook = lookCurve.getPoint(introU);

    // Post-intro: an extremely gentle, slow orbit (at the approved hero distance)
    const orbitT = Math.max(0, t - INTRO);
    const ang = orbitT * 0.045;
    const radius = 5.2;
    const ambientPos = new THREE.Vector3(
      Math.cos(ang) * radius,
      1.65 + Math.sin(orbitT * 0.12) * 0.22,
      Math.sin(ang) * radius
    );
    const ambientLook = new THREE.Vector3(0, 0.2, 0);

    const w = smoothRange(t, INTRO - 1.5, INTRO + 1.0);
    const pos = introPos.clone().lerp(ambientPos, w);
    const look = introLook.clone().lerp(ambientLook, w);
    return { pos, look };
  }

  const _cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  return {
    sample(t) {
      // Two heartbeats that synchronize: Germany and Seoul, 8h apart. The
      // second pulse starts half a period offset and converges by ~t=44.
      const sync = smoothRange(t, 24, 44);
      const beatA = heartbeatPulse(t, 1.9);
      const beatB = heartbeatPulse(t + (1 - sync) * 0.95, 1.9);
      const beatRaw = Math.max(beatA, beatB);
      const beat = beatRaw * beatEnv(t);
      const cam = sampleCam(t);
      // camera orbit angle (post-intro) so main.js can keep the lights stable
      const orbitAngle = Math.max(0, t - INTRO) * 0.045;
      // traveling light wave: one clean sweep across the crystal (27 -> 31s)
      const wave = chan([[0, 0], [27, 0], [29, 0.85], [31, 0.18], [34, 0]])(t);
      const waveTime = t >= 27 && t <= 31 ? -1 + 2 * ((t - 27) / 4) : 0;
      return {
        time: t,
        formation: formation(t),
        formOpacity: formOpacity(t),
        dustOpacity: dustOpacity(t),
        rayIntensity: rayIntensity(t),
        heartScale: heartScale(t),
        materialize: materialize(t),
        heartRotY: heartRotY(t),
        auraIntensity: auraIntensity(t),
        coreIntensity: coreIntensity(t),
        bloom: bloom(t),
        beat,
        wave,
        waveTime,
        camPos: cam.pos,
        camLook: cam.look,
        orbitAngle,
        caption: smoothRange(t, 31, 36), // the title surfaces before the pull-back
      };
    },
  };
}
