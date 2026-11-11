import * as THREE from 'three';
import { buildFishModel, disposeModel } from './fishModels.js';

// Ảnh thu nhỏ 3D cho Fishdex / chợ cá, vẽ bằng một renderer nhỏ riêng, tạo dần theo khung hình.
const W = 192, H = 128;
let renderer = null, scene, cam;
const cache = new Map();
const queue = [];
let pumping = false;

function init() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a90', 1.7));
  const d = new THREE.DirectionalLight('#ffffff', 2.4);
  d.position.set(2, 3, 4);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 20);
  cam.position.set(0, 0.35, 3.2);
  cam.lookAt(0, 0, 0);
}

export function fishThumb(fish, silhouette = false) {
  const key = fish.id + (silhouette ? ':s' : '');
  if (cache.has(key)) return cache.get(key);
  try {
    if (!renderer) init();
    const m = buildFishModel(fish, { silhouette });
    m.scale.setScalar(1.45);
    m.rotation.set(0.12, -0.45, 0);
    scene.add(m);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(m);
    disposeModel(m);
    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('thumb', e);
    cache.set(key, '');
    return '';
  }
}

function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 10) {
    const job = queue.shift();
    if (!job.img.isConnected) continue;
    const url = fishThumb(job.fish, job.silhouette);
    if (url) job.img.src = url;
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

/** Gán ảnh cho <img>: lấy từ cache nếu có, không thì xếp hàng tạo dần. */
export function thumbInto(img, fish, silhouette = false) {
  const key = fish.id + (silhouette ? ':s' : '');
  const c = cache.get(key);
  if (c) {
    img.src = c;
    return;
  }
  queue.push({ img, fish, silhouette });
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
}
