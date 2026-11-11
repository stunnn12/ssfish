import * as THREE from 'three';

const cache = new Map();

/** Vật liệu Lambert flat-shading dùng chung (phong cách low-poly). */
export function lam(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    cache.set(key, m);
  }
  return m;
}

export function basic(color, extra) {
  const key = 'b' + color + (extra ? JSON.stringify(extra) : '');
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...extra });
    cache.set(key, m);
  }
  return m;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Tô màu theo từng mặt tam giác (giúp mặt phẳng low-poly rõ nét). */
export function faceColors(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    d.fromBufferAttribute(pos, i + 2);
    const cx = (a.x + b.x + d.x) / 3, cy = (a.y + b.y + d.y) / 3, cz = (a.z + b.z + d.z) / 3;
    colorFn(c, cx, cy, cz, i / 3);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = c.r;
      col[(i + k) * 3 + 1] = c.g;
      col[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export const VCOL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
}
