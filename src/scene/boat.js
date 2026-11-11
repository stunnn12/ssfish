import * as THREE from 'three';
import { lam, mesh } from './materials.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone8 = new THREE.ConeGeometry(1, 1, 8);

export const DEFAULT_HULL = {
  rowboat: '#c0703a',
  sailboat: '#2f7fc0',
  motorboat: '#f2f2f2',
  icebreaker: '#c8382e',
  submarine: '#7a8696',
};

/** Thân thuyền: hộp được nắn nhọn mũi (mũi hướng -Z), tô màu theo mặt. */
function hullGeo(len, width, height, bowSharp, hullColor, deckColor, trimColor) {
  const geo = new THREE.BoxGeometry(width, height, len, 2, 2, 6).toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fz = z / (len / 2);
    if (fz < 0) x *= 1 - Math.pow(-fz, 1.6) * bowSharp;
    else x *= 1 - fz * 0.12;
    if (y < 0) x *= 0.6;
    if (y > 0 && fz < -0.4) y += (-fz - 0.4) * 0.45 * height;
    p.setXYZ(i, x, y, z);
  }
  const hc = new THREE.Color(hullColor), dc = new THREE.Color(deckColor), tc = new THREE.Color(trimColor);
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const cy = (a.y + b.y + c.y) / 3;
    const k = Math.abs(n.y) > 0.75 && cy > 0 ? dc : cy < -height * 0.18 ? tc : hc;
    for (let j = 0; j < 3; j++) k.toArray(col, (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function buildFisher() {
  const g = new THREE.Group();
  const shirt = lam('#e2603c'), pants = lam('#2f4a6e'), skin = lam('#f0c49a'), straw = lam('#e9c46a');
  const hips = mesh(box, pants, 0, 0.12, -0.12);
  hips.scale.set(0.44, 0.24, 0.5);
  g.add(hips);
  const shins = mesh(box, pants, 0, 0.0, -0.4);
  shins.scale.set(0.4, 0.3, 0.16);
  g.add(shins);
  const torso = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.55, 7), shirt, 0, 0.5, 0);
  g.add(torso);
  const head = mesh(new THREE.IcosahedronGeometry(0.18, 1), skin, 0, 0.94, 0);
  g.add(head);
  const brim = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 10), straw, 0, 1.04, 0);
  g.add(brim);
  const crown = mesh(new THREE.ConeGeometry(0.2, 0.2, 8), straw, 0, 1.15, 0);
  g.add(crown);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.21, 0.7, 0);
    const arm = mesh(box, shirt, 0, -0.21, 0);
    arm.scale.set(0.1, 0.42, 0.1);
    pivot.add(arm);
    const hand = mesh(new THREE.IcosahedronGeometry(0.06, 0), skin, 0, -0.43, 0);
    pivot.add(hand);
    pivot.rotation.set(1.15, -sx * 0.3, 0);
    g.add(pivot);
    arms.push(pivot);
  }
  const hand = new THREE.Object3D();
  hand.position.set(0.16, 0.55, -0.4);
  g.add(hand);
  return { group: g, hand, arms, head };
}

/**
 * Dựng thuyền theo loại. Trả về { group, seat: Vector3 vị trí ngồi của người câu, length }.
 * Thuyền hướng mũi về -Z.
 */
export function buildBoat(id, skinColor) {
  const color = skinColor || DEFAULT_HULL[id] || '#c0703a';
  const g = new THREE.Group();
  const wood = '#b98a5a';
  let seat, length;
  const H = (len, w, h, sharp, deck = wood, trim = '#3a2a20') => new THREE.Mesh(hullGeo(len, w, h, sharp, color, deck, trim), hullMat);

  if (id === 'sailboat') {
    const hull = H(4.6, 1.9, 0.8, 0.85, wood, '#f4f4f4');
    hull.position.y = 0.1;
    g.add(hull);
    const mast = mesh(cyl8, lam('#8a6a48'), 0, 3.0, -0.4);
    mast.scale.set(0.07, 5.4, 0.07);
    g.add(mast);
    const boom = mesh(cyl8, lam('#8a6a48'), 0, 1.2, 0.6);
    boom.scale.set(0.05, 2.0, 0.05);
    boom.rotation.x = Math.PI / 2;
    g.add(boom);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 5.5, -0.35, 0, 1.3, -0.35, 0, 1.3, 1.6], 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, lam('#fbf6ea', { side: THREE.DoubleSide }));
    sail.position.x = 0.05;
    g.add(sail);
    seat = new THREE.Vector3(0, 0.5, -1.2);
    length = 4.6;
  } else if (id === 'motorboat') {
    const hull = H(5.2, 2.1, 0.9, 0.8, '#dcd2c0', '#2a5a8a');
    hull.position.y = 0.15;
    g.add(hull);
    const cabin = mesh(box, lam('#f4f4f4'), -0.35, 1.05, 1.3);
    cabin.scale.set(1.1, 0.8, 1.4);
    g.add(cabin);
    const glass = mesh(box, lam('#2a4a6a'), -0.35, 1.15, 0.58);
    glass.scale.set(1.0, 0.4, 0.05);
    glass.rotation.x = -0.3;
    g.add(glass);
    const roof = mesh(box, lam(color === '#f2f2f2' ? '#2a5a8a' : color), -0.35, 1.5, 1.3);
    roof.scale.set(1.25, 0.1, 1.6);
    g.add(roof);
    const motor = mesh(box, lam('#2a2e36'), 0, 0.5, 2.75);
    motor.scale.set(0.5, 0.8, 0.4);
    g.add(motor);
    seat = new THREE.Vector3(0.38, 0.62, -1.3);
    length = 5.2;
  } else if (id === 'icebreaker') {
    const hull = H(6.6, 2.7, 1.3, 0.75, '#8a6a4a', '#2a2a30');
    hull.position.y = 0.2;
    g.add(hull);
    const cabin = mesh(box, lam('#f4f4f4'), -0.45, 1.4, 1.9);
    cabin.scale.set(1.4, 1.0, 1.8);
    g.add(cabin);
    for (const sx of [-1, 1]) {
      const w = mesh(box, lam('#2a4a6a'), -0.45 + sx * 0.35, 1.55, 0.98);
      w.scale.set(0.4, 0.32, 0.05);
      g.add(w);
    }
    const stack = mesh(cyl8, lam('#2a2a30'), -0.45, 2.35, 2.5);
    stack.scale.set(0.26, 1.0, 0.26);
    g.add(stack);
    const band = mesh(cyl8, lam(color), -0.45, 2.7, 2.5);
    band.scale.set(0.28, 0.24, 0.28);
    g.add(band);
    seat = new THREE.Vector3(0.5, 0.95, -1.8);
    length = 6.6;
  } else if (id === 'submarine') {
    const body = mesh(new THREE.CapsuleGeometry(0.95, 4.4, 4, 10), lam(color), 0, 0.05, 0);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const deck = mesh(box, lam('#5a626e'), 0, 0.95, -0.4);
    deck.scale.set(1.2, 0.1, 3.6);
    g.add(deck);
    const tower = mesh(box, lam(color), -0.3, 1.35, 1.6);
    tower.scale.set(0.7, 0.8, 1.3);
    g.add(tower);
    const peri = mesh(cyl8, lam('#3a3e46'), -0.2, 2.05, 1.8);
    peri.scale.set(0.05, 0.7, 0.05);
    g.add(peri);
    for (const sz of [-1.5, -0.5]) {
      const w = mesh(cyl8, lam('#ffd27a', { emissive: '#ffb040', emissiveIntensity: 0.4 }), 0.96, 0.1, sz);
      w.scale.set(0.16, 0.05, 0.16);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    seat = new THREE.Vector3(0.3, 1.0, -1.8);
    length = 6.4;
  } else {
    const hull = H(3.4, 1.5, 0.6, 0.85);
    hull.position.y = 0.1;
    g.add(hull);
    const bench = mesh(box, lam('#8a6040'), 0, 0.44, -0.6);
    bench.scale.set(1.3, 0.08, 0.3);
    g.add(bench);
    for (const sx of [-1, 1]) {
      const oar = mesh(cyl8, lam('#9a7048'), sx * 0.75, 0.45, 0.4);
      oar.scale.set(0.035, 2.2, 0.035);
      oar.rotation.set(Math.PI / 2 - 0.15, 0, sx * 0.35);
      g.add(oar);
    }
    seat = new THREE.Vector3(0, 0.42, 0.3);
    length = 3.4;
  }
  return { group: g, seat, length };
}

export function disposeBoat(group) {
  group.traverse(o => {
    if (o.geometry && o.geometry !== box && o.geometry !== cyl8 && o.geometry !== cone8) o.geometry.dispose();
  });
}
