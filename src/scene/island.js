import * as THREE from 'three';
import { lam, basic, mesh, faceColors, VCOL } from './materials.js';
import { mulberry32 } from '../util.js';

// Hình học dùng chung (không dispose khi đổi đảo).
const G = {
  trunk: new THREE.CylinderGeometry(0.16, 0.24, 1, 5),
  leaf: new THREE.ConeGeometry(0.45, 2.4, 3),
  ico0: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  dome: new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
};

const RINGS_T = [0, 0.16, 0.3, 0.44, 0.57, 0.69, 0.79, 0.87, 0.93, 1.0];
const SEGS = 22;
export const SPOT_DIST = 74;

function makeProfile(kind, H) {
  if (kind === 'volcano') {
    return t => {
      if (t < 0.12) return H * 0.78 + (t / 0.12) * H * 0.22;
      if (t < 0.8) return 0.9 + (H - 0.9) * Math.pow(1 - (t - 0.12) / 0.68, 1.5);
      if (t <= 0.93) return 0.9 - ((t - 0.8) / 0.13) * 0.75;
      return -3;
    };
  }
  return t => {
    if (t < 0.79) return 0.9 + (H - 0.9) * Math.pow(0.5 + 0.5 * Math.cos((Math.PI * t) / 0.79), 0.85);
    if (t <= 0.93) return 0.9 - ((t - 0.79) / 0.14) * 0.75;
    return -3;
  };
}

const yawOut = a => Math.PI / 2 - a; // quay +Z cục bộ hướng ra ngoài đảo

export function buildIsland(region) {
  const th = region.theme;
  const kind = th.props;
  const R = th.islandRadius;
  const H = th.islandHeight;
  const rng = mulberry32(region.id * 7919 + 17);
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const rj = a => 1 + 0.13 * Math.sin(a * 3 + ph[0]) + 0.07 * Math.sin(a * 5 + ph[1]) + 0.04 * Math.sin(a * 9 + ph[2]);
  const profile = makeProfile(kind, H);
  const edge = a => R * rj(a);
  const surf = (a, t) => {
    const r = edge(a) * t;
    return new THREE.Vector3(Math.cos(a) * r, profile(t), Math.sin(a) * r);
  };
  const at = (a, r, y = 0) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);

  const group = new THREE.Group();
  const animated = [];
  const nightMats = [];

  // ---------- Địa hình ----------
  const rows = RINGS_T.map((t, i) => {
    const row = [];
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      const r = edge(a) * t * (i === RINGS_T.length - 1 ? 1.12 : 1);
      let h = profile(t);
      if (i > 0 && i < RINGS_T.length - 3) h += (rng() - 0.5) * Math.min(1.4, H * 0.1);
      row.push(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r));
    }
    return row;
  });
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const c0 = rows[0][0];
  for (let j = 0; j < SEGS; j++) push(c0, rows[1][(j + 1) % SEGS], rows[1][j]);
  for (let i = 1; i < rows.length - 1; i++) {
    for (let j = 0; j < SEGS; j++) {
      const jn = (j + 1) % SEGS;
      const a = rows[i][j], b = rows[i][jn], c = rows[i + 1][j], d = rows[i + 1][jn];
      push(a, b, c);
      push(b, d, c);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = k => new THREE.Color(th[k]);
  const cs = { wet: col('sand').multiplyScalar(0.8), sand: col('sand'), g1: col('ground'), g2: col('ground2'), rock: col('rock'), peak: col('peak') };
  const grassTop = kind === 'lighthouse' ? 0.5 : kind === 'volcano' ? 0.35 : 0.74;
  const terrainGeo = faceColors(tg, (c, x, y) => {
    if (y < 0.3) c.copy(cs.wet);
    else if (y < 1.1) c.copy(cs.sand);
    else if (y < H * grassTop) c.copy(rng() < 0.5 ? cs.g1 : cs.g2);
    else c.copy(rng() < 0.6 ? cs.rock : cs.peak);
  });
  const terrain = new THREE.Mesh(terrainGeo, VCOL);
  terrain.userData.own = true;
  group.add(terrain);

  // ---------- Đạo cụ ----------
  const add = (obj, p, yaw = 0, s = 1) => {
    obj.position.copy(p);
    obj.rotation.y = yaw;
    if (s !== 1) obj.scale.setScalar(s);
    group.add(obj);
    return obj;
  };

  function palm(h = 3.2) {
    const g = new THREE.Group();
    const lean = (rng() - 0.5) * 0.6;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const m = mesh(G.trunk, lam('#9a7048'));
      m.scale.set(1 - i * 0.12, h / segs, 1 - i * 0.12);
      m.position.set(lean * (i / segs) * h * 0.4, (i + 0.5) * (h / segs), 0);
      m.rotation.z = -lean * 0.4;
      g.add(m);
    }
    const top = new THREE.Vector3(lean * h * 0.4, h, 0);
    for (let k = 0; k < 6; k++) {
      const leaf = mesh(G.leaf, lam(k % 2 ? '#3f9a3a' : '#52b448'));
      const a = (k / 6) * Math.PI * 2 + rng() * 0.5;
      leaf.scale.set(1, 1, 0.35);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(0, a, -(Math.PI / 2 + 0.35));
      leaf.position.set(top.x + Math.cos(a) * 1.05, top.y - 0.35, top.z - Math.sin(a) * 1.05);
      g.add(leaf);
    }
    for (let k = 0; k < 3; k++) {
      const n = mesh(G.ico0, lam('#6a4a2a'), top.x + Math.cos(k * 2) * 0.22, top.y - 0.25, top.z + Math.sin(k * 2) * 0.22);
      n.scale.setScalar(0.17);
      g.add(n);
    }
    return g;
  }

  function roundTree() {
    const g = new THREE.Group();
    const t = mesh(G.trunk, lam('#7a5434'), 0, 0.8, 0);
    t.scale.set(1, 1.6, 1);
    g.add(t);
    const s = 1.2 + rng() * 0.6;
    const b = mesh(G.ico1, lam(rng() < 0.5 ? '#4f9e3e' : '#5cae48'), 0, 1.9 + s * 0.5, 0);
    b.scale.set(s, s * 1.1, s);
    g.add(b);
    const b2 = mesh(G.ico0, lam('#68ba52'), s * 0.5, 1.6 + s * 0.4, 0.2);
    b2.scale.setScalar(s * 0.6);
    g.add(b2);
    return g;
  }

  function pine(snow) {
    const g = new THREE.Group();
    const t = mesh(G.trunk, lam('#5a3e2a'), 0, 0.5, 0);
    g.add(t);
    const s = 0.9 + rng() * 0.5;
    for (let i = 0; i < 3; i++) {
      const c = mesh(G.cone6, lam(snow ? '#2e5a46' : '#2f6e3a'), 0, 1.3 + i * 0.9 * s, 0);
      c.scale.set((1.5 - i * 0.4) * s, 1.4 * s, (1.5 - i * 0.4) * s);
      g.add(c);
      if (snow) {
        const w = mesh(G.cone6, lam('#f4f8ff'), 0, 1.6 + i * 0.9 * s, 0);
        w.scale.set((0.95 - i * 0.25) * s, 0.8 * s, (0.95 - i * 0.25) * s);
        g.add(w);
      }
    }
    return g;
  }

  const windowMat = new THREE.MeshLambertMaterial({ color: '#3a3326', emissive: '#ffcc66', emissiveIntensity: 0, flatShading: true });
  nightMats.push({ m: windowMat, max: 1.4 });

  function house(wall, roof, w = 2.2, h = 1.6, d = 2) {
    const g = new THREE.Group();
    const body = mesh(G.box, lam(wall), 0, h / 2, 0);
    body.scale.set(w, h, d);
    g.add(body);
    const r = mesh(G.cone4, lam(roof), 0, h + 0.6, 0);
    r.scale.set(Math.max(w, d) * 0.82, 1.2, Math.max(w, d) * 0.82);
    r.rotation.y = Math.PI / 4;
    g.add(r);
    const door = mesh(G.box, lam('#5a3a22'), 0, 0.45, d / 2 + 0.02);
    door.scale.set(0.5, 0.9, 0.05);
    g.add(door);
    for (const sx of [-1, 1]) {
      const win = mesh(G.box, windowMat, sx * w * 0.3, h * 0.6, d / 2 + 0.02);
      win.scale.set(0.38, 0.38, 0.05);
      g.add(win);
    }
    return g;
  }

  function dock(a, len, deckColor = '#a8784a', postColor = '#6a4a30') {
    const g = new THREE.Group();
    const r0 = edge(a) * 0.86;
    const r1 = edge(a) + len;
    const L = r1 - r0;
    const deck = mesh(G.box, lam(deckColor), 0, 0.9, 0);
    deck.scale.set(2.2, 0.2, L);
    g.add(deck);
    for (let z = -L / 2 + 0.6; z <= L / 2; z += 2.4) {
      for (const sx of [-1, 1]) {
        const p = mesh(G.cyl6, lam(postColor), sx * 1.05, -0.6, z);
        p.scale.set(0.14, 3.2, 0.14);
        g.add(p);
      }
    }
    add(g, at(a, (r0 + r1) / 2), yawOut(a));
    return { end: at(a, r1), side: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)) };
  }

  function rock(s, color = th.rock) {
    const m = mesh(G.ico0, lam(color));
    m.scale.set(s * (0.8 + rng() * 0.5), s * (0.6 + rng() * 0.5), s * (0.8 + rng() * 0.5));
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    return m;
  }

  function scatter(n, fn, tMin, tMax, avoid = []) {
    for (let i = 0; i < n; i++) {
      let a = rng() * Math.PI * 2;
      for (let k = 0; k < 6 && avoid.some(v => Math.abs(Math.atan2(Math.sin(a - v), Math.cos(a - v))) < 0.25); k++) a = rng() * Math.PI * 2;
      const t = tMin + rng() * (tMax - tMin);
      add(fn(), surf(a, t), rng() * 6.28);
    }
  }

  function farIslets(fn) {
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = 120 + rng() * 70;
      add(fn(), at(a, r, 0), rng() * 6.28);
    }
  }

  function islet() {
    const g = new THREE.Group();
    const s = 3 + rng() * 5;
    const base = mesh(G.ico1, lam(th.sand));
    base.scale.set(s * 1.6, s * 0.45, s * 1.4);
    g.add(base);
    const top = mesh(G.ico1, lam(th.ground));
    top.scale.set(s, s * 0.6, s * 0.9);
    top.position.y = s * 0.25;
    g.add(top);
    if (kind === 'village' || kind === 'coral') {
      const p = palm(2.6);
      p.position.y = s * 0.6;
      g.add(p);
    }
    return g;
  }

  const pa = region.portAngle ?? 0;
  let portDock = null;
  const spotAng = id => region.spots.find(s => s.id === id)?.angle ?? 0;

  // ---------- Theo chủ đề vùng ----------
  if (kind === 'village') {
    portDock = dock(pa, 10);
    const houses = [['#f4ead8', '#d4553a'], ['#f2d9b0', '#3a7fc0'], ['#ffffff', '#e08a3a'], ['#e8dcc8', '#c04a4a']];
    [-0.75, -0.32, 0.32, 0.75].forEach((o, i) => add(house(...houses[i]), surf(pa + o, 0.56), yawOut(pa + o) + (rng() - 0.5) * 0.3));
    scatter(8, () => palm(), 0.78, 0.86, [pa]);
    scatter(7, roundTree, 0.25, 0.55, [pa - 0.5, pa, pa + 0.5]);
    scatter(7, () => rock(0.8 + rng()), 0.88, 1.02);
    const bA = spotAng('beach');
    for (let k = 0; k < 3; k++) {
      const u = new THREE.Group();
      const pole = mesh(G.cyl6, lam('#ffffff'), 0, 1.1, 0);
      pole.scale.set(0.05, 2.2, 0.05);
      u.add(pole);
      const top = mesh(G.cone8, lam(k % 2 ? '#ff5a5a' : '#ffd23a'), 0, 2.3, 0);
      top.scale.set(1.4, 0.5, 1.4);
      u.add(top);
      add(u, surf(bA - 0.25 + k * 0.25, 0.84));
    }
    add(house('#d8b88a', '#c8a050', 1.6, 1.2, 1.4), surf(bA, 0.7), yawOut(bA));
    const rA = spotAng('river');
    for (let k = 0; k < 14; k++) {
      const a = rA + (rng() - 0.5) * 0.5;
      const reed = mesh(G.cone4, lam(rng() < 0.5 ? '#6aa040' : '#86b850'));
      reed.scale.set(0.12, 1.4 + rng(), 0.12);
      add(reed, surf(a, 0.88 + rng() * 0.08).add(new THREE.Vector3(0, 0.6, 0)));
    }
    for (let k = 0; k < 4; k++) add(rock(1.2 + rng()), surf(rA + (rng() - 0.5) * 0.4, 0.95));
    farIslets(islet);
  } else if (kind === 'coral') {
    portDock = dock(pa, 7, '#c8a070');
    for (const o of [-0.35, 0.35, 0.75]) {
      const g = new THREE.Group();
      for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
        const p = mesh(G.cyl6, lam('#8a6a48'), x, 0.2, z);
        p.scale.set(0.1, 2.4, 0.1);
        g.add(p);
      }
      const body = mesh(G.box, lam('#e8c890'), 0, 1.9, 0);
      body.scale.set(2.2, 1.3, 2.2);
      g.add(body);
      const roof = mesh(G.cone4, lam('#c89a50'), 0, 3.1, 0);
      roof.scale.set(2.1, 1.3, 2.1);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const win = mesh(G.box, windowMat, 0, 1.9, 1.12);
      win.scale.set(0.5, 0.45, 0.05);
      g.add(win);
      add(g, at(pa + o, edge(pa + o) * 0.97, 0), yawOut(pa + o));
    }
    scatter(12, () => palm(2.8 + rng()), 0.55, 0.86, [pa]);
    const coralCols = ['#ff7aa0', '#ff9a5a', '#c070ff', '#ffd25a', '#ff5a7a', '#60e0c0'];
    const coral = () => {
      const g = new THREE.Group();
      const c = coralCols[Math.floor(rng() * coralCols.length)];
      const type = rng();
      if (type < 0.45) {
        for (let k = 0; k < 4; k++) {
          const b = mesh(G.cone6, lam(c), (rng() - 0.5) * 0.8, 0.6, (rng() - 0.5) * 0.8);
          b.scale.set(0.18, 1.4 + rng(), 0.18);
          b.rotation.set((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
          g.add(b);
        }
      } else if (type < 0.75) {
        const b = mesh(G.ico1, lam(c));
        b.scale.set(1, 0.6, 1);
        g.add(b);
      } else {
        for (let k = 0; k < 3; k++) {
          const b = mesh(G.cyl8, lam(c), (rng() - 0.5) * 0.7, 0.4, (rng() - 0.5) * 0.7);
          b.scale.set(0.22, 0.9 + rng() * 0.8, 0.22);
          g.add(b);
        }
      }
      return g;
    };
    const reefA = spotAng('reef');
    for (let k = 0; k < 34; k++) {
      const near = k < 22;
      const a = near ? reefA + (rng() - 0.5) * 1.3 : rng() * Math.PI * 2;
      const r = edge(a) + 2 + rng() * 13;
      add(coral(), at(a, r, -0.8 + rng() * 0.9), rng() * 6.28, 0.8 + rng() * 0.7);
    }
    const lagA = spotAng('lagoon');
    for (let k = 0; k < 4; k++) {
      const a = lagA + (k - 1.5) * 0.35;
      const bar = mesh(G.ico1, lam(th.sand));
      bar.scale.set(4 + rng() * 3, 0.5, 2 + rng() * 2);
      add(bar, at(a, edge(a) + 9 + rng() * 6, -0.05), rng() * 3);
    }
    farIslets(islet);
  } else if (kind === 'lighthouse') {
    portDock = dock(pa, 9, '#8a7058', '#4a3a2a');
    add(house('#e8e0d0', '#3a4a6a', 2.4, 1.8, 2.2), surf(pa - 0.4, 0.62), yawOut(pa - 0.4));
    add(house('#d0c8b8', '#6a3a3a', 2, 1.5, 1.8), surf(pa + 0.45, 0.6), yawOut(pa + 0.45));
    const lh = new THREE.Group();
    const cols = ['#f4f4f4', '#d8403a'];
    for (let i = 0; i < 5; i++) {
      const s = mesh(G.cyl8, lam(cols[i % 2]), 0, 0.8 + i * 1.5, 0);
      s.scale.set(1.25 - i * 0.1, 1.5, 1.25 - i * 0.1);
      lh.add(s);
    }
    const gallery = mesh(G.cyl8, lam('#2a2a30'), 0, 8.1, 0);
    gallery.scale.set(1.15, 0.2, 1.15);
    lh.add(gallery);
    const lampMat = new THREE.MeshLambertMaterial({ color: '#fff6c0', emissive: '#ffe680', emissiveIntensity: 0.3 });
    nightMats.push({ m: lampMat, max: 2.5, min: 0.3 });
    const lamp = mesh(G.cyl8, lampMat, 0, 8.75, 0);
    lamp.scale.set(0.65, 1.1, 0.65);
    lh.add(lamp);
    const cap = mesh(G.cone8, lam('#d8403a'), 0, 9.75, 0);
    cap.scale.set(0.9, 0.9, 0.9);
    lh.add(cap);
    const beamGeo = new THREE.ConeGeometry(4, 46, 12, 1, true);
    beamGeo.translate(0, -23, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beams = new THREE.Group();
    beams.position.y = 8.75;
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.y = Math.PI;
    beams.add(b1, b2);
    lh.add(beams);
    b1.userData.own = true;
    b1.userData.ownMat = true;
    add(lh, surf(pa + 0.9, 0.3));
    animated.push((dt, t, night) => {
      beams.rotation.y += dt * 0.8;
      beamMat.opacity = 0.09 * night;
      beams.visible = night > 0.05;
    });
    scatter(8, roundTree, 0.3, 0.6, [pa, pa + 0.9]);
    for (let k = 0; k < 16; k++) {
      const a = rng() * Math.PI * 2;
      add(rock(1 + rng() * 1.6), surf(a, 0.88 + rng() * 0.14));
    }
    const wA = spotAng('wreck');
    const wreck = new THREE.Group();
    const hull = mesh(G.box, lam('#5a4030'), 0, 0, 0);
    hull.scale.set(3.2, 2.2, 10);
    wreck.add(hull);
    const mast = mesh(G.cyl6, lam('#4a3424'), 0, 3.2, -1);
    mast.scale.set(0.18, 6, 0.18);
    mast.rotation.z = 0.35;
    wreck.add(mast);
    const bow = mesh(G.cone4, lam('#5a4030'), 0, 0, -6.2);
    bow.scale.set(2.2, 2.6, 1.55);
    bow.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
    wreck.add(bow);
    wreck.rotation.set(0.25, 0, 0.35);
    add(wreck, at(wA, edge(wA) + 12, -0.7), yawOut(wA) + 1.2);
    wreck.rotation.x = 0.25;
    wreck.rotation.z = 0.35;
    const dA = spotAng('deep');
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Group();
      const body = mesh(G.cyl8, lam('#e04a3a'), 0, 0.4, 0);
      body.scale.set(0.5, 1, 0.5);
      b.add(body);
      const top = mesh(G.cone8, lam('#f4f4f4'), 0, 1.3, 0);
      top.scale.set(0.35, 0.9, 0.35);
      b.add(top);
      const p = add(b, at(dA + (k - 1) * 0.3, edge(dA) + 20 + k * 6, 0));
      animated.push((dt, t) => {
        p.position.y = Math.sin(t * 1.4 + k) * 0.25 - 0.1;
        p.rotation.z = Math.sin(t * 1.1 + k) * 0.12;
      });
    }
    farIslets(() => {
      const g = new THREE.Group();
      const r = rock(4 + rng() * 5, '#6a6a70');
      g.add(r);
      return g;
    });
  } else if (kind === 'ice') {
    portDock = dock(pa, 9, '#8a6a4a');
    for (const o of [-0.6, 0.5, 0.85]) {
      const ig = new THREE.Group();
      const d = mesh(G.dome, lam('#f4f8ff'));
      d.scale.set(1.6, 1.4, 1.6);
      ig.add(d);
      const door = mesh(G.box, lam('#2a3440'), 0, 0.45, 1.5);
      door.scale.set(0.6, 0.8, 0.3);
      ig.add(door);
      add(ig, surf(pa + o, 0.6), yawOut(pa + o));
    }
    add(house('#b8483a', '#f4f8ff', 2.4, 1.7, 2.2), surf(pa - 0.25, 0.55), yawOut(pa - 0.25));
    scatter(12, () => pine(true), 0.2, 0.65, [pa]);
    scatter(8, () => rock(0.9 + rng(), '#8a98a8'), 0.85, 1.0);
    const berg = (s) => {
      const m = mesh(G.ico0, lam(rng() < 0.5 ? '#eaf6ff' : '#cfe8fa'));
      m.scale.set(s * (0.8 + rng() * 0.6), s * (0.7 + rng() * 0.9), s * (0.8 + rng() * 0.6));
      m.rotation.set(rng() * 0.3, rng() * 3, rng() * 0.3);
      return m;
    };
    for (let k = 0; k < 9; k++) add(berg(4 + rng() * 6), at(rng() * 6.28, 50 + rng() * 120, 0));
    const floe = () => {
      const m = mesh(G.cyl6, lam('#eef6ff'));
      m.scale.set(2 + rng() * 2.5, 0.5, 2 + rng() * 2.5);
      return m;
    };
    const ihA = spotAng('icehole');
    for (let k = 0; k < 10; k++) {
      const a = ihA + (rng() - 0.5) * 1.1;
      add(floe(), at(a, edge(a) + 3 + rng() * 18, 0.05), rng() * 6.28);
    }
    const sbA = spotAng('sealbay');
    for (let k = 0; k < 6; k++) {
      const a = sbA + (rng() - 0.5) * 0.9;
      const p = at(a, edge(a) + 4 + rng() * 12, 0.05);
      add(floe(), p, rng() * 6.28);
      if (k < 4) {
        const seal = new THREE.Group();
        const body = mesh(G.ico1, lam('#7a8696'), 0, 0.55, 0);
        body.scale.set(1.0, 0.45, 0.45);
        seal.add(body);
        const head = mesh(G.ico1, lam('#6a7686'), 0.85, 0.85, 0);
        head.scale.setScalar(0.3);
        seal.add(head);
        const s = add(seal, p.clone().setY(0.25), rng() * 6.28);
        animated.push((dt, t) => { head.position.y = 0.85 + Math.max(0, Math.sin(t * 0.7 + k * 2)) * 0.15; s.rotation.z = Math.sin(t * 0.5 + k) * 0.03; });
      }
    }
    farIslets(() => berg(6 + rng() * 6));
  } else if (kind === 'volcano') {
    portDock = dock(pa, 8, '#4a4448', '#2a2628');
    const lanternMat = new THREE.MeshLambertMaterial({ color: '#ffb060', emissive: '#ff8a2a', emissiveIntensity: 0.6 });
    nightMats.push({ m: lanternMat, max: 2.2, min: 0.6 });
    for (const o of [-0.4, 0.4]) {
      const h = house('#5a5254', '#2a2224', 2.2, 1.5, 2);
      const l = mesh(G.ico0, lanternMat, 0.9, 1.6, 1.15);
      l.scale.setScalar(0.18);
      h.add(l);
      add(h, surf(pa + o, 0.84), yawOut(pa + o));
    }
    const lavaMat = basic('#ff6a1a', { fog: true });
    const lavaHot = basic('#ffb03a');
    const crater = mesh(new THREE.CircleGeometry(edge(0) * 0.12 * 0.9, 10), lavaHot, 0, H * 0.82, 0);
    crater.rotation.x = -Math.PI / 2;
    crater.userData.own = true;
    group.add(crater);
    const river = (a) => {
      const N = 14, w = 0.9;
      const verts = [];
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = 0.12 + (k / N) * 0.83;
        const aa = a + Math.sin(k * 0.9) * 0.05;
        pts.push(surf(aa, t).add(new THREE.Vector3(0, 0.12, 0)));
      }
      for (let k = 0; k < N; k++) {
        const ww = w * (0.6 + k / N);
        const a0 = pts[k].clone().addScaledVector(side, -ww), a1 = pts[k].clone().addScaledVector(side, ww);
        const b0 = pts[k + 1].clone().addScaledVector(side, -ww * 1.05), b1 = pts[k + 1].clone().addScaledVector(side, ww * 1.05);
        verts.push(...a0.toArray(), ...b0.toArray(), ...a1.toArray(), ...a1.toArray(), ...b0.toArray(), ...b1.toArray());
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const m = new THREE.Mesh(g, lavaMat);
      m.material.side = THREE.DoubleSide;
      m.userData.own = true;
      group.add(m);
    };
    const lvA = spotAng('lava');
    river(lvA);
    river(lvA + 0.7);
    river(spotAng('abyss') + 1.3);
    for (let k = 0; k < 10; k++) {
      const a = lvA + (rng() - 0.5) * 1.0;
      const g = mesh(G.ico0, rng() < 0.5 ? lavaMat : lam('#2a2224'));
      g.scale.set(0.8 + rng(), 0.5 + rng() * 0.6, 0.8 + rng());
      add(g, at(a, edge(a) + 2 + rng() * 10, -0.1));
    }
    const abA = spotAng('abyss');
    const spike = () => {
      const m = mesh(G.cone4, lam(rng() < 0.5 ? '#2a2234' : '#3a3044'));
      m.scale.set(0.9 + rng(), 3 + rng() * 4, 0.9 + rng());
      m.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
      return m;
    };
    for (let k = 0; k < 14; k++) {
      const a = k < 9 ? abA + (rng() - 0.5) * 1.2 : rng() * 6.28;
      add(spike(), at(a, edge(a) + rng() * 8, -0.5));
    }
    const puffs = [];
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(G.ico1, new THREE.MeshLambertMaterial({ color: '#6a6266', transparent: true, opacity: 0.6, flatShading: true, depthWrite: false }));
      m.userData.ownMat = true;
      group.add(m);
      puffs.push({ m, t: k / 9 });
    }
    animated.push((dt, t) => {
      for (const p of puffs) {
        p.t = (p.t + dt * 0.06) % 1;
        const s = 1.5 + p.t * 6;
        p.m.scale.setScalar(s);
        p.m.position.set(Math.sin(p.t * 3 + p.m.id) * 2 + p.t * 10, H + 1 + p.t * 30, Math.cos(p.t * 2 + p.m.id) * 2);
        p.m.material.opacity = 0.55 * (1 - p.t);
      }
      crater.material.color.setRGB(1, 0.6 + Math.sin(t * 2) * 0.08, 0.2);
    });
    farIslets(spike);
  }

  // Vị trí thuyền khi ở cảng: cạnh đầu bến.
  const portPos = portDock
    ? portDock.end.clone().addScaledVector(portDock.side, 2.6).addScaledVector(at(pa, 1), -1.5)
    : at(pa, edge(pa) + 9);
  portPos.y = 0;

  return {
    group,
    radius: R * 1.1,
    portPos,
    portAngle: pa,
    update(dt, t, night) {
      for (const n of nightMats) n.m.emissiveIntensity = (n.min ?? 0) + night * (n.max - (n.min ?? 0));
      for (const fn of animated) fn(dt, t, night);
    },
    dispose() {
      group.traverse(o => {
        if (o.userData.own && o.geometry) o.geometry.dispose();
        if (o.userData.ownMat && o.material) o.material.dispose();
      });
      for (const n of nightMats) n.m.dispose();
    },
  };
}
