import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Cinematic post chain: tone-mapped render -> gentle bloom (soft pink).
 * The vignette is done in CSS so the 3D pipeline stays lean and reliable.
 * Bloom strength is driven by the sequence so the glow only feels meaningful.
 */
export function createPost(renderer, scene, camera, nMips = 5) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.55, 0.5);
  bloom.threshold = 0.95;
  bloom.strength = 0.28;
  bloom.radius = 0.5;
  bloom.nMips = nMips;
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  // Size the composer and every pass to the actual drawing buffer.
  const _size = new THREE.Vector2();
  renderer.getDrawingBufferSize(_size);
  composer.setSize(_size.x, _size.y);
  composer.setPixelRatio(renderer.getPixelRatio());

  return {
    composer,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
      composer.setPixelRatio(renderer.getPixelRatio());
    },
    setBloomStrength(v) {
      bloom.strength = v;
    },
    render(dt) {
      composer.render(dt);
    },
  };
}
