import * as THREE from 'three';
import { mulberry32, hashStr, smoothstep } from '../util.js';

// Model cá low-poly sinh bằng code: ~16 dáng thân tham số hóa + 12 dáng đặc biệt.
// Mỗi loài chỉ khác màu/hoa văn/chi tiết → 100 loài mà không cần file model.
// Đầu cá hướng +X. Hàm trả về Group đã chuẩn hóa: kích thước lớn nhất = 1, tâm ở gốc.

const WHITE = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);

const PRESETS = {
  slim: { h: 0.24, w: 0.17, taper: 0.3, tail: 'fork', tl: 0.3, th: 0.17, dorsal: [0.08, 0.1, -0.12] },
  flying: { h: 0.22, w: 0.17, taper: 0.3, tail: 'fork', tl: 0.3, th: 0.2, dorsal: [0.0, 0.08, -0.15], wings: true },
  salmon: { h: 0.3, w: 0.2, taper: 0.35, tail: 'fork', tl: 0.28, th: 0.18, dorsal: [0.12, 0.14, -0.06] },
  round: { h: 0.5, w: 0.24, taper: 0.35, tail: 'fan', tl: 0.28, th: 0.2, dorsal: [0.2, 0.16, -0.25] },
  bass: { h: 0.4, w: 0.26, taper: 0.35, tail: 'fan', tl: 0.28, th: 0.2, dorsal: [0.25, 0.16, -0.28], spiky: true },
  lion: { h: 0.4, w: 0.24, taper: 0.4, tail: 'fan', tl: 0.26, th: 0.2, spines: true },
  disc: { h: 0.78, w: 0.13, taper: 0.45, tail: 'fan', tl: 0.22, th: 0.17, dorsal: [0.18, 0.3, -0.32], anal: true },
  sunfish: { h: 0.85, w: 0.16, taper: 0.1, tail: 'stub', tl: 0.1, th: 0.3, tallFins: true },
  pike: { len: 1.1, h: 0.21, w: 0.19, taper: 0.15, tail: 'fork', tl: 0.24, th: 0.15, dorsal: [-0.2, 0.12, -0.4] },
  tuna: { h: 0.38, w: 0.3, taper: 0.6, tail: 'crescent', tl: 0.3, th: 0.26, dorsal: [0.12, 0.15, -0.04], finlets: true },
  sword: { h: 0.32, w: 0.26, taper: 0.6, tail: 'crescent', tl: 0.3, th: 0.26, dorsal: [0.2, 0.12, 0.0], bill: 0.5, sail: true },
  narwhal: { h: 0.36, w: 0.34, taper: 0.5, tail: 'fluke', tl: 0.26, th: 0.22, bill: 0.6, billColor: '#efe8d6', noDorsal: true },
  shark: { len: 1.1, h: 0.3, w: 0.28, taper: 0.55, tail: 'shark', tl: 0.36, th: 0.3, dorsal: [0.12, 0.3, -0.12], bigPect: true },
  sturgeon: { len: 1.15, h: 0.24, w: 0.24, taper: 0.5, tail: 'shark', tl: 0.3, th: 0.24, dorsal: [-0.2, 0.14, -0.3], scutes: true, snout: true, whiskers: true },
  catfish: { len: 1.05, h: 0.28, w: 0.32, taper: 0.3, tail: 'fan', tl: 0.24, th: 0.16, dorsal: [0.12, 0.13, -0.02], whiskers: true },
  angler: { len: 0.9, h: 0.6, w: 0.5, taper: 0.65, tail: 'fan', tl: 0.2, th: 0.15, dorsal: [-0.05, 0.1, -0.25], lure: true, teeth: true, bigMouth: true },
};

// ---------- tiện ích hình học ----------
function geoFrom(v) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Đa giác vây trong mặt phẳng XY (tam giác quạt từ điểm đầu). */
function finPoly(pts) {
  const v = [];
  for (let i = 1; i < pts.length - 1; i++) v.push(pts[0][0], pts[0][1], 0, pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1], 0);
  return geoFrom(v);
}

/** Dải vây: đáy y=0, đỉnh theo danh sách [x, y]. */
function finStrip(pts) {
  const v = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    v.push(x0, 0, 0, x1, 0, 0, x0, y0, 0, x1, 0, 0, x1, y1, 0, x0, y0, 0);
  }
  return geoFrom(v);
}

/** Thân elip low-poly, đuôi thon, tô màu lưng → bụng theo từng mặt. */
function bodyGeo(L, h, w, color, taper = 0.35, hump = 0, detail = 1) {
  const src = new THREE.IcosahedronGeometry(1, detail);
  const g = src.index ? src.toNonIndexed() : src;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i), z = p.getZ(i);
    if (x < 0) {
      const k = 1 + x * taper;
      y *= k;
      z *= k;
    }
    if (hump && y > 0 && x > 0) y *= 1 + hump * x;
    p.setXYZ(i, (x * L) / 2, (y * h) / 2, (z * w) / 2);
  }
  const top = new THREE.Color(color);
  const belly = top.clone().lerp(WHITE, 0.55);
  const dark = top.clone().multiplyScalar(0.82);
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / (h / 2);
    c.copy(top).lerp(belly, smoothstep(0.15, -0.6, cy));
    if (cy > 0.7) c.copy(dark);
    for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function stick(a, b, r0, r1, mat, seg = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

function ball(r, mat, x, y, z, detail = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.position.set(x, y, z);
  return m;
}

function meshAt(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Vây hai bên: đa giác XY xoay sang mặt XZ, rủ xuống một góc. */
function sideFins(g, pts, mat, x, y, z, droop = 0.3) {
  for (const side of [-1, 1]) {
    const m = meshAt(finPoly(pts), mat, x, y, side * z);
    m.rotation.x = side * (Math.PI / 2 + droop);
    g.add(m);
  }
}

function eyes(g, mats, x, y, z, r) {
  for (const side of [-1, 1]) {
    g.add(ball(r, mats.eye, x, y, side * z, 1));
    g.add(ball(r * 0.35, mats.white, x + r * 0.35, y + r * 0.4, side * (z + r * 0.75)));
  }
}

function makeMats(f, silhouette) {
  if (silhouette) {
    const m = new THREE.MeshBasicMaterial({ color: '#22384e', side: THREE.DoubleSide });
    return { body: m, solid: m, fin: m, accent: m, eye: m, white: m, glow: m, horn: m };
  }
  const color = new THREE.Color(f.color);
  const op = f.opacity ?? 1;
  const tr = op < 1;
  const emissive = f.glow ? color.clone().multiplyScalar(0.5) : new THREE.Color(0, 0, 0);
  const finCol = f.color2 && !f.pattern ? new THREE.Color(f.color2) : color.clone().multiplyScalar(0.78);
  const acc = new THREE.Color(f.color2 || '#ffffff');
  return {
    body: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: tr, opacity: op, emissive }),
    solid: new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: tr, opacity: op, emissive }),
    fin: new THREE.MeshLambertMaterial({ color: finCol, flatShading: true, side: THREE.DoubleSide, transparent: tr, opacity: op, emissive: f.glow ? finCol.clone().multiplyScalar(0.4) : 0 }),
    accent: new THREE.MeshLambertMaterial({ color: acc, flatShading: true, emissive: f.glow ? acc.clone().multiplyScalar(0.35) : 0 }),
    eye: new THREE.MeshBasicMaterial({ color: '#101418' }),
    white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    glow: new THREE.MeshBasicMaterial({ color: '#fff3a0' }),
    horn: new THREE.MeshLambertMaterial({ color: '#efe8d6', flatShading: true }),
  };
}

// ---------- hoa văn ----------
function sectionAt(xNorm, h, w, taper) {
  const base = Math.sqrt(Math.max(0, 1 - xNorm * xNorm));
  const k = xNorm < 0 ? 1 + xNorm * taper : 1;
  return [(h / 2) * base * k, (w / 2) * base * k];
}

function addPattern(g, f, mats, L, h, w, taper) {
  if (f.pattern === 'bands') {
    for (const xn of [0.42, 0.02, -0.38]) {
      const [ry, rz] = sectionAt(xn, h, w, taper);
      const b = meshAt(new THREE.IcosahedronGeometry(1, 1), mats.accent, (xn * L) / 2, 0, 0);
      b.scale.set(0.035, ry * 1.06, rz * 1.1);
      g.add(b);
    }
  } else if (f.pattern === 'spots') {
    const rng = mulberry32(hashStr(f.id));
    for (let i = 0; i < 12; i++) {
      const xn = -0.55 + rng() * 1.05;
      const th = (rng() - 0.5) * 2.2;
      const side = i % 2 ? 1 : -1;
      const [ry, rz] = sectionAt(xn, h, w, taper);
      const s = ball(0.028 + rng() * 0.012, mats.accent, (xn * L) / 2, ry * Math.cos(th) * 0.98, side * rz * Math.sin(Math.abs(th)) * 0.98 + side * 0.004);
      s.scale.y = 0.7;
      g.add(s);
    }
  }
}

// ---------- thân tham số hóa ----------
function buildParam(f, P, mats) {
  const g = new THREE.Group();
  const L = P.len || 1;
  const { h, w, taper } = P;
  g.add(meshAt(bodyGeo(L, h, w, f.color, taper, f.hump ? 0.5 : 0), mats.body));
  const topAt = x => {
    const [ry] = sectionAt((x * 2) / L, h, w, taper);
    return ry * 0.92;
  };

  // đuôi
  const tl = P.tl, th = P.th;
  const tails = {
    fork: [[0, 0], [-tl, th], [-tl * 0.55, 0], [-tl, -th]],
    fan: [[0, 0], [-tl * 0.85, th], [-tl, th * 0.35], [-tl, -th * 0.35], [-tl * 0.85, -th]],
    crescent: [[0, 0], [-tl * 0.55, th * 1.25], [-tl * 0.3, 0], [-tl * 0.55, -th * 1.25]],
    shark: [[0, 0], [-tl * 0.8, th * 1.2], [-tl * 0.45, 0.02], [-tl * 0.4, -th * 0.55]],
    stub: [[0.04, th], [-tl, th * 0.85], [-tl, -th * 0.85], [0.04, -th]],
    fluke: [[0, 0], [-tl * 0.55, th * 1.25], [-tl * 0.3, 0], [-tl * 0.55, -th * 1.25]],
  };
  const tail = meshAt(finPoly(tails[P.tail]), mats.fin, (-L / 2) * (P.tail === 'stub' ? 0.82 : 0.9), 0, 0);
  if (P.tail === 'fluke') tail.rotation.x = Math.PI / 2;
  g.add(tail);

  // vây lưng
  if (P.dorsal && !P.noDorsal) {
    const [fx, fh, bx] = P.dorsal;
    let geo;
    if (P.spiky) {
      const pts = [];
      const n = 7;
      for (let i = 0; i <= n; i++) pts.push([fx - (i * (fx - bx)) / n, i === n ? fh * 0.35 : i % 2 === 0 ? fh : fh * 0.55]);
      geo = finStrip(pts);
    } else {
      geo = finPoly([[fx, 0], [bx + (fx - bx) * 0.25, fh], [bx - 0.05, fh * 0.55], [bx, 0]]);
    }
    g.add(meshAt(geo, mats.fin, 0, topAt((fx + bx) / 2) - 0.01, 0));
    if (P.anal) {
      const a = meshAt(finPoly([[fx * 0.3, 0], [bx + (fx - bx) * 0.25, fh * 0.8], [bx - 0.05, fh * 0.45], [bx, 0]]), mats.fin, 0, -topAt((fx + bx) / 2) + 0.01, 0);
      a.scale.y = -1;
      g.add(a);
    }
  }
  if (P.sail && !f.noSail) {
    g.add(meshAt(finPoly([[0.3, 0], [0.22, 0.34], [0.0, 0.38], [-0.2, 0.2], [-0.28, 0]]), mats.fin, 0, topAt(0) - 0.02, 0));
  }
  if (P.tallFins) {
    g.add(meshAt(finPoly([[-0.05, 0], [-0.22, 0.42], [-0.34, 0.36], [-0.32, 0]]), mats.fin, 0, topAt(-0.2) - 0.03, 0));
    const a = meshAt(finPoly([[-0.05, 0], [-0.22, 0.42], [-0.34, 0.36], [-0.32, 0]]), mats.fin, 0, -topAt(-0.2) + 0.03, 0);
    a.scale.y = -1;
    g.add(a);
  }
  if (P.spines) {
    for (let i = 0; i < 9; i++) {
      const x = 0.22 - i * 0.06;
      const y0 = topAt(x) - 0.02;
      g.add(stick([x, y0, 0], [x - 0.1, y0 + 0.28 - Math.abs(i - 3) * 0.02, 0], 0.012, 0.004, i % 2 ? mats.accent : mats.fin, 4));
    }
    sideFins(g, [[0, 0], [-0.32, 0.26], [-0.42, 0.05], [-0.34, -0.12]], mats.fin, L * 0.15, -h * 0.1, w * 0.4, 0.4);
  }

  // vây ngực
  if (P.bigPect) sideFins(g, [[0, 0], [-0.22, 0.2], [-0.06, 0.04]], mats.fin, L * 0.14, -h * 0.25, w * 0.38, 0.6);
  else if (P.wings) sideFins(g, [[0, 0], [-0.45, 0.42], [-0.58, 0.3], [-0.42, 0.04]], mats.fin, L * 0.16, h * 0.05, w * 0.35, -0.1);
  else if (!P.spines) sideFins(g, [[0, 0], [-0.14, 0.07], [-0.12, -0.03]], mats.fin, L * 0.18, -h * 0.12, w * 0.4, 0.5);

  if (P.finlets) {
    for (let i = 0; i < 3; i++) {
      const x = -0.2 - i * 0.07;
      const ty = topAt(x);
      g.add(meshAt(finPoly([[0, 0], [-0.03, 0.04], [-0.05, 0]]), mats.accent, x, ty - 0.005, 0));
      const b = meshAt(finPoly([[0, 0], [-0.03, 0.04], [-0.05, 0]]), mats.accent, x, -ty + 0.005, 0);
      b.scale.y = -1;
      g.add(b);
    }
  }
  if (P.scutes) {
    for (let i = 0; i < 6; i++) {
      const x = 0.32 - i * 0.11;
      const s = meshAt(new THREE.ConeGeometry(0.025, 0.05, 4), mats.accent, x, topAt(x) + 0.01, 0);
      g.add(s);
    }
  }

  // đầu
  const fx = (L / 2) * 0.99;
  if (P.bill) g.add(stick([fx - 0.04, -0.01, 0], [fx + P.bill, 0, 0], 0.035, 0.004, P.billColor ? mats.horn : mats.solid, 6));
  if (P.snout || f.snout) g.add(stick([fx - 0.06, -0.02, 0], [fx + 0.2, 0.02, 0], 0.05, 0.012, mats.solid, 6));
  if (f.hammer) {
    const hm = ball(1, mats.solid, fx - 0.04, 0.0, 0, 1);
    hm.scale.set(0.08, 0.05, 0.42);
    g.add(hm);
    for (const s of [-1, 1]) g.add(ball(0.03, mats.eye, fx - 0.04, 0.02, s * 0.4));
  } else {
    const er = Math.max(0.028, h * 0.085) * (f.bigEyes ? 1.8 : 1) * (P.lure ? 0.8 : 1);
    const [ry, rz] = sectionAt(0.66, h, w, taper);
    eyes(g, mats, (L / 2) * 0.66, ry * 0.35, rz * 0.82, er);
  }
  if (P.whiskers && !f.noWhiskers) {
    for (const s of [-1, 1]) {
      g.add(stick([fx - 0.02, -h * 0.12, s * w * 0.18], [fx + 0.18, -h * 0.35, s * w * 0.75], 0.008, 0.003, mats.fin, 4));
      g.add(stick([fx - 0.04, -h * 0.2, s * w * 0.1], [fx + 0.08, -h * 0.55, s * w * 0.4], 0.006, 0.003, mats.fin, 4));
    }
  }
  if (P.bigMouth) {
    const m = ball(1, mats.eye, fx - 0.06, -h * 0.12, 0, 1);
    m.scale.set(0.08, h * 0.2, w * 0.32);
    g.add(m);
  }
  if (P.teeth || f.teeth) {
    for (let i = 0; i < 6; i++) {
      const z = (i - 2.5) * w * 0.09;
      const t = meshAt(new THREE.ConeGeometry(0.012, 0.05, 4), mats.white, fx - 0.03, -h * 0.02, z);
      t.rotation.z = Math.PI;
      g.add(t);
    }
  }
  if (P.lure && !f.noLure) {
    const top = topAt(0.25);
    g.add(stick([L * 0.22, top, 0], [L * 0.62, top + 0.3, 0], 0.01, 0.006, mats.fin, 4));
    g.add(ball(0.055, mats.glow, L * 0.64, top + 0.3, 0, 1));
  }
  addPattern(g, f, mats, L, h, w, taper);
  return g;
}

// ---------- dáng đặc biệt ----------
function buildEel(f, mats, dragon) {
  const g = new THREE.Group();
  const segs = dragon ? 14 : 10;
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const u = i / (segs - 1);
    const x = 0.55 - u * 1.1;
    const z = Math.sin(u * Math.PI * 1.7) * (dragon ? 0.16 : 0.09);
    const y = dragon ? Math.sin(u * Math.PI * 2.0 + 0.4) * 0.1 : 0;
    const r = (dragon ? 0.14 : 0.068) * (1 - u * (dragon ? 0.78 : 0.72)) * (i === 0 ? 1.12 : 1);
    pts.push([x, y, z, r]);
    const s = meshAt(bodyGeo(dragon ? 0.16 : 0.18, r * 2, r * 2, f.color, 0, 0), mats.body, x, y, z);
    g.add(s);
    if (dragon && i > 0 && i < segs - 1) {
      const sp = meshAt(new THREE.ConeGeometry(r * 0.45, r * 1.7, 4), mats.accent, x - 0.01, y + r * 1.15, z);
      sp.rotation.z = 0.35;
      g.add(sp);
    }
  }
  const [hx, hy, hz, hr] = pts[0];
  if (dragon) {
    // đầu rồng: mõm dài, hàm, sừng lớn, râu, mắt phát sáng
    const head = ball(1, mats.solid, hx + 0.06, hy + 0.01, hz, 1);
    head.scale.set(0.15, 0.1, 0.12);
    g.add(head);
    const snout = ball(1, mats.solid, hx + 0.18, hy - 0.01, hz, 1);
    snout.scale.set(0.11, 0.06, 0.08);
    g.add(snout);
    const jaw = ball(1, mats.accent, hx + 0.15, hy - 0.07, hz, 1);
    jaw.scale.set(0.1, 0.03, 0.065);
    g.add(jaw);
    for (const s of [-1, 1]) {
      g.add(stick([hx + 0.02, hy + hr * 0.7, hz + s * hr * 0.45], [hx - 0.2, hy + hr * 2.6, hz + s * hr * 1.2], 0.03, 0.005, mats.horn, 5));
      g.add(stick([hx + 0.26, hy - 0.02, hz + s * 0.04], [hx + 0.36, hy - 0.16, hz + s * 0.24], 0.009, 0.003, mats.accent, 4));
      g.add(ball(hr * 0.2, mats.glow, hx + 0.12, hy + hr * 0.42, hz + s * hr * 0.62, 1));
      for (let k = 0; k < 3; k++) {
        const t = meshAt(new THREE.ConeGeometry(0.012, 0.045, 4), mats.white, hx + 0.12 + k * 0.05, hy - 0.05, hz + s * 0.045);
        t.rotation.z = Math.PI;
        g.add(t);
      }
    }
    // 4 chân có móng
    for (const i of [2, 7]) {
      const [x, y, z, r] = pts[i];
      for (const s of [-1, 1]) {
        g.add(stick([x, y - r * 0.4, z + s * r * 0.6], [x + 0.05, y - r * 1.9, z + s * r * 1.8], r * 0.28, r * 0.18, mats.solid, 5));
        g.add(ball(r * 0.25, mats.horn, x + 0.07, y - r * 2.0, z + s * r * 1.9));
      }
    }
    const [tx, ty, tz, tr] = pts[segs - 1];
    g.add(meshAt(finPoly([[0, 0], [-0.08, 0.14], [-0.2, 0.05], [-0.16, -0.08]]), mats.accent, tx - tr, ty, tz));
  } else {
    eyes(g, mats, hx + hr * 0.5, hy + hr * 0.35, hr * 0.6, hr * 0.28);
    if (f.teeth) for (let i = 0; i < 4; i++) {
      const t = meshAt(new THREE.ConeGeometry(0.01, 0.04, 4), mats.white, hx + hr * 0.9, hy - hr * 0.2, hz + (i - 1.5) * 0.02);
      t.rotation.z = Math.PI;
      g.add(t);
    }
  }
  if (!dragon) {
    const [tx, ty, tz] = pts[segs - 1];
    g.add(meshAt(finPoly([[0, 0], [-0.1, 0.06], [-0.12, -0.04]]), mats.fin, tx, ty, tz));
  }
  if (f.pattern === 'spots') {
    const rng = mulberry32(hashStr(f.id));
    for (let i = 1; i < segs - 1; i++) {
      const [x, y, z, r] = pts[i];
      g.add(ball(r * 0.35, mats.accent, x, y + r * 0.8, z + (rng() - 0.5) * r));
    }
  }
  return g;
}

function buildFlat(f, mats) {
  const g = new THREE.Group();
  g.add(meshAt(bodyGeo(1, 0.12, 0.62, f.color, 0.4), mats.body));
  const fringe = ball(1, mats.fin, -0.02, -0.005, 0, 1);
  fringe.scale.set(0.53, 0.015, 0.36);
  g.add(fringe);
  const tail = meshAt(finPoly([[0, 0], [-0.18, 0.14], [-0.2, 0], [-0.18, -0.14]]), mats.fin, -0.46, 0, 0);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  for (const z of [-0.05, 0.06]) {
    g.add(ball(0.035, mats.eye, 0.3, 0.06, z, 1));
    g.add(ball(0.012, mats.white, 0.31, 0.09, z));
  }
  return g;
}

function buildRay(f, mats) {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(1, 1);
  const ng = geo.index ? geo.toNonIndexed() : geo;
  const p = ng.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 0.42, p.getY(i) * 0.07, p.getZ(i) * 0.9);
  const top = new THREE.Color(f.color), bel = top.clone().lerp(WHITE, 0.7);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cy = p.getY(i) + p.getY(i + 1) + p.getY(i + 2);
    (cy >= 0 ? top : bel).toArray(col, i * 3);
    (cy >= 0 ? top : bel).toArray(col, i * 3 + 3);
    (cy >= 0 ? top : bel).toArray(col, i * 3 + 6);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.computeVertexNormals();
  g.add(new THREE.Mesh(ng, mats.body));
  g.add(stick([-0.38, 0, 0], [-1.1, 0.02, 0], 0.025, 0.004, mats.solid, 4));
  const head = ball(1, mats.solid, 0.36, 0.01, 0, 1);
  head.scale.set(0.12, 0.05, 0.16);
  g.add(head);
  eyes(g, mats, 0.3, 0.05, 0.11, 0.025);
  if (f.pattern === 'spots') {
    const rng = mulberry32(hashStr(f.id));
    for (let i = 0; i < 16; i++) {
      const x = (rng() - 0.5) * 0.5, z = (rng() - 0.5) * 1.2;
      if (Math.abs(x) / 0.42 + Math.abs(z) / 0.9 > 0.75) continue;
      const s = ball(0.025, mats.accent, x, 0.07 * (1 - Math.abs(x) / 0.42 - Math.abs(z) / 0.9) + 0.004, z);
      s.scale.y = 0.4;
      g.add(s);
    }
  }
  return g;
}

function buildPuffer(f, mats) {
  const g = new THREE.Group();
  g.add(meshAt(bodyGeo(0.66, 0.6, 0.6, f.color, 0.15), mats.body));
  const dirs = new Map();
  const src = new THREE.IcosahedronGeometry(1, 1).attributes.position;
  for (let i = 0; i < src.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(src, i);
    dirs.set(v.toArray().map(n => n.toFixed(2)).join(','), v);
  }
  const coneGeo = new THREE.ConeGeometry(0.022, 0.1, 4);
  for (const d of dirs.values()) {
    if (d.x > 0.75 || d.x < -0.75) continue;
    const s = meshAt(coneGeo, mats.fin, d.x * 0.33, d.y * 0.3, d.z * 0.3);
    s.quaternion.setFromUnitVectors(UP, d);
    g.add(s);
  }
  g.add(meshAt(finPoly([[0, 0], [-0.14, 0.1], [-0.16, 0], [-0.14, -0.1]]), mats.fin, -0.32, 0, 0));
  eyes(g, mats, 0.22, 0.1, 0.17, 0.05);
  sideFins(g, [[0, 0], [-0.1, 0.08], [-0.1, -0.02]], mats.fin, 0.1, -0.02, 0.28, 0.2);
  return g;
}

function buildSquid(f, mats) {
  const g = new THREE.Group();
  const mantle = new THREE.ConeGeometry(0.15, 0.62, 7);
  mantle.rotateZ(-Math.PI / 2);
  g.add(meshAt(mantle, mats.solid, 0.17, 0, 0));
  sideFins(g, [[0, 0], [-0.16, 0.14], [-0.22, 0.0]], mats.fin, 0.48, 0, 0.02, 0);
  const head = ball(1, mats.solid, -0.17, 0, 0, 1);
  head.scale.set(0.12, 0.11, 0.12);
  g.add(head);
  eyes(g, mats, -0.15, 0.03, 0.09, 0.045);
  const rng = mulberry32(hashStr(f.id));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const y = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
    g.add(stick([-0.24, y, z], [-0.62 - rng() * 0.08, y * 2.2, z * 2.2], 0.022, 0.006, mats.solid, 4));
  }
  for (const s of [-1, 1]) g.add(stick([-0.24, 0, s * 0.03], [-0.95, -0.04, s * 0.12], 0.012, 0.004, mats.solid, 4));
  return g;
}

function buildOctopus(f, mats) {
  const g = new THREE.Group();
  const head = meshAt(bodyGeo(0.6, 0.64, 0.6, f.color, 0, 0), mats.body, 0.05, 0.16, 0);
  head.rotation.z = 0.35;
  g.add(head);
  eyes(g, mats, 0.24, 0.08, 0.15, 0.045);
  // 8 xúc tu: chuỗi đốt liền nhau, thon dần và cong ngược lên ở đầu mút
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * Math.PI * 2 + 0.2;
    let prev = null;
    for (let j = 0; j < 7; j++) {
      const r = 0.1 + j * 0.06;
      const y = -0.04 - j * 0.035 + (j > 4 ? (j - 4) * 0.06 : 0);
      const p = [Math.cos(phi) * r, y, Math.sin(phi) * r];
      const rad = 0.06 * (1 - j / 8);
      if (prev) g.add(stick(prev[0], p, prev[1], rad, mats.solid, 5));
      prev = [p, rad];
    }
  }
  if (f.pattern === 'spots') {
    const rng = mulberry32(hashStr(f.id));
    for (let i = 0; i < 12; i++) {
      const th = rng() * Math.PI * 0.9, ph = rng() * Math.PI * 2;
      const n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      const s = ball(0.035, mats.accent, 0.05 + n.x * 0.29, 0.16 + n.y * 0.31, n.z * 0.29);
      s.scale.set(1, 0.5, 1);
      s.quaternion.setFromUnitVectors(UP, n);
      g.add(s);
    }
  }
  return g;
}

function buildTurtle(f, mats) {
  const g = new THREE.Group();
  const shellGeo = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const sg = shellGeo.index ? shellGeo.toNonIndexed() : shellGeo;
  const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 0.46, p.getY(i) * 0.24, p.getZ(i) * 0.38);
  const base = new THREE.Color(f.color);
  const rng = mulberry32(hashStr(f.id));
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    c.copy(base).multiplyScalar(0.75 + rng() * 0.45);
    for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3);
  }
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sg.computeVertexNormals();
  g.add(new THREE.Mesh(sg, mats.body));
  const skin = new THREE.MeshLambertMaterial({ color: base.clone().lerp(new THREE.Color('#c8d8a0'), 0.55), flatShading: true });
  const plate = ball(1, skin, 0, 0, 0, 1);
  plate.scale.set(0.44, 0.05, 0.36);
  g.add(plate);
  const head = ball(1, skin, 0.52, 0.04, 0, 1);
  head.scale.set(0.12, 0.09, 0.09);
  g.add(head);
  eyes(g, mats, 0.58, 0.07, 0.06, 0.02);
  for (const s of [-1, 1]) {
    const fl = ball(1, skin, 0.22, -0.02, s * 0.4, 1);
    fl.scale.set(0.26, 0.025, 0.08);
    fl.rotation.y = -s * 0.6;
    g.add(fl);
    const bl = ball(1, skin, -0.32, -0.02, s * 0.26, 1);
    bl.scale.set(0.12, 0.02, 0.06);
    bl.rotation.y = s * 0.5;
    g.add(bl);
  }
  g.add(stick([-0.42, 0, 0], [-0.55, -0.02, 0], 0.03, 0.005, skin, 4));
  return g;
}

function buildCrab(f, mats) {
  const g = new THREE.Group();
  g.add(meshAt(bodyGeo(0.56, 0.24, 0.78, f.color, 0), mats.body));
  for (const s of [-1, 1]) {
    g.add(stick([0.15, 0, s * 0.26], [0.32, 0.06, s * 0.4], 0.035, 0.03, mats.solid, 5));
    const claw = ball(1, mats.solid, 0.42, 0.07, s * 0.42, 1);
    claw.scale.set(0.13, 0.075, 0.08);
    g.add(claw);
    g.add(stick([0.5, 0.08, s * 0.42], [0.62, 0.11, s * 0.39], 0.03, 0.008, mats.solid, 4));
    g.add(stick([0.5, 0.04, s * 0.44], [0.6, 0.02, s * 0.45], 0.025, 0.008, mats.solid, 4));
    for (let i = 0; i < 3; i++) {
      const x = 0.05 - i * 0.12;
      g.add(stick([x, 0, s * 0.33], [x - 0.04, 0.05, s * 0.55], 0.022, 0.018, mats.solid, 4));
      g.add(stick([x - 0.04, 0.05, s * 0.55], [x - 0.09, -0.2, s * 0.66], 0.018, 0.006, mats.solid, 4));
    }
    g.add(stick([0.22, 0.08, s * 0.06], [0.26, 0.2, s * 0.08], 0.012, 0.01, mats.solid, 4));
    g.add(ball(0.03, mats.eye, 0.26, 0.21, s * 0.08, 1));
  }
  return g;
}

function buildSeahorse(f, mats) {
  const g = new THREE.Group();
  const chain = [[0.0, 0.42, 0.11], [0.03, 0.3, 0.1], [0.05, 0.18, 0.1], [0.04, 0.06, 0.09], [0.0, -0.05, 0.08], [-0.04, -0.15, 0.065], [-0.06, -0.25, 0.05], [-0.03, -0.33, 0.04], [0.03, -0.36, 0.035], [0.07, -0.32, 0.03], [0.06, -0.27, 0.025]];
  for (const [x, y, r] of chain) g.add(meshAt(bodyGeo(r * 2, r * 2, r * 1.6, f.color, 0), mats.body, x, y, 0));
  const head = meshAt(bodyGeo(0.2, 0.18, 0.14, f.color, 0), mats.body, 0.04, 0.5, 0);
  head.rotation.z = -0.4;
  g.add(head);
  g.add(stick([0.1, 0.47, 0], [0.27, 0.43, 0], 0.03, 0.022, mats.solid, 5));
  const crown = meshAt(new THREE.ConeGeometry(0.035, 0.08, 4), mats.solid, 0.0, 0.6, 0);
  g.add(crown);
  eyes(g, mats, 0.07, 0.52, 0.055, 0.022);
  g.add(meshAt(finPoly([[0, 0.08], [-0.1, 0.04], [-0.09, -0.06], [0, -0.06]]), mats.fin, -0.06, 0.1, 0));
  return g;
}

function buildJelly(f, mats) {
  const g = new THREE.Group();
  const domeMat = mats.body.type === 'MeshBasicMaterial'
    ? mats.body
    : new THREE.MeshLambertMaterial({ color: f.color, transparent: true, opacity: 0.78, emissive: new THREE.Color(f.color).multiplyScalar(0.45), flatShading: true, side: THREE.DoubleSide });
  const dome = meshAt(new THREE.SphereGeometry(0.34, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0, 0);
  dome.scale.y = 0.8;
  g.add(dome);
  const inner = ball(0.15, mats.solid, 0, 0.06, 0, 1);
  g.add(inner);
  const rng = mulberry32(hashStr(f.id));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 0.3;
    g.add(stick([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * (0.7 + rng() * 0.4), -0.7 - rng() * 0.3, Math.sin(a) * r * (0.7 + rng() * 0.4)], 0.012, 0.003, mats.fin, 3));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(stick([Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06], [Math.cos(a) * 0.12, -0.55, Math.sin(a) * 0.12], 0.04, 0.012, mats.accent, 4));
  }
  return g;
}

function buildShrimp(f, mats) {
  const g = new THREE.Group();
  const chain = [[0.3, 0.02, 0.09], [0.19, 0.06, 0.088], [0.08, 0.07, 0.082], [-0.03, 0.05, 0.074], [-0.12, 0.0, 0.064], [-0.19, -0.08, 0.054], [-0.22, -0.17, 0.044]];
  for (const [x, y, r] of chain) g.add(meshAt(bodyGeo(r * 2.4, r * 2, r * 1.8, f.color, 0), mats.body, x, y, 0));
  const head = meshAt(bodyGeo(0.2, 0.15, 0.14, f.color, 0.2), mats.body, 0.4, 0.02, 0);
  g.add(head);
  g.add(stick([0.48, 0.04, 0], [0.62, 0.08, 0], 0.012, 0.003, mats.solid, 4));
  eyes(g, mats, 0.44, 0.07, 0.05, 0.02);
  for (const s of [-1, 1]) g.add(stick([0.46, 0.05, s * 0.03], [0.95, 0.28, s * 0.14], 0.006, 0.002, mats.fin, 3));
  for (let i = 0; i < 5; i++) {
    const x = 0.32 - i * 0.08;
    g.add(stick([x, -0.04, 0], [x + 0.03, -0.14, 0], 0.008, 0.004, mats.fin, 3));
  }
  g.add(meshAt(finPoly([[0, 0], [-0.08, -0.1], [0.0, -0.13], [0.08, -0.1]]), mats.fin, -0.22, -0.2, 0));
  return g;
}

const SPECIAL = {
  eel: (f, m) => buildEel(f, m, false),
  dragon: (f, m) => buildEel(f, m, true),
  flat: buildFlat,
  ray: buildRay,
  puffer: buildPuffer,
  squid: buildSquid,
  octopus: buildOctopus,
  turtle: buildTurtle,
  crab: buildCrab,
  seahorse: buildSeahorse,
  jelly: buildJelly,
  shrimp: buildShrimp,
};

/**
 * Dựng model cho một loài. opts.silhouette = bóng đen cho cá chưa bắt.
 * Trả về Group gốc đã chuẩn hóa (kích thước lớn nhất = 1).
 */
export function buildFishModel(f, opts = {}) {
  const mats = makeMats(f, opts.silhouette);
  const inner = SPECIAL[f.model] ? SPECIAL[f.model](f, mats) : buildParam(f, PRESETS[f.model] || PRESETS.slim, mats);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  inner.position.copy(center).multiplyScalar(-1);
  const norm = new THREE.Group();
  norm.add(inner);
  norm.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  const root = new THREE.Group();
  root.add(norm);
  root.userData.fishId = f.id;
  return root;
}

export function disposeModel(root) {
  const mats = new Set();
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) mats.add(o.material);
  });
  for (const m of mats) m.dispose();
}
