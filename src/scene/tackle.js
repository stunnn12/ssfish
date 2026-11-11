import * as THREE from 'three';
import { lam } from './materials.js';

/** Cần câu 3 đoạn, có thể cong theo lực căng dây, chuyển động bằng lò xo. */
export class Rod {
  constructor() {
    this.root = new THREE.Group();
    this.pivots = [];
    this.tip = new THREE.Object3D();
    this.mat = new THREE.MeshLambertMaterial({ color: '#c8a85a', flatShading: true });
    const lens = [0.95, 0.85, 0.75];
    const radii = [[0.04, 0.03], [0.03, 0.019], [0.019, 0.008]];
    let parent = this.root;
    for (let i = 0; i < 3; i++) {
      const pv = new THREE.Group();
      if (i > 0) pv.position.y = lens[i - 1];
      parent.add(pv);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radii[i][1], radii[i][0], lens[i], 6), this.mat);
      m.position.y = lens[i] / 2;
      pv.add(m);
      this.pivots.push(pv);
      parent = pv;
    }
    this.tip.position.y = lens[2];
    parent.add(this.tip);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.38, 6), lam('#3a2a20'));
    handle.position.y = -0.12;
    this.root.add(handle);
    this.reel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8), lam('#9aa4b0'));
    this.reel.rotation.z = Math.PI / 2;
    this.reel.position.set(0.075, 0.1, 0);
    this.root.add(this.reel);
    this.rest = -0.62;
    this.pitch = this.rest;
    this.pitchTarget = this.rest;
    this.pitchVel = 0;
    this.bend = 0.05;
    this.bendShow = 0.05;
    this.spin = 0;
  }

  setColor(c) {
    this.mat.color.set(c);
  }

  update(dt) {
    const k = 140, d = 15;
    this.pitchVel += ((this.pitchTarget - this.pitch) * k - this.pitchVel * d) * dt;
    this.pitch += this.pitchVel * dt;
    this.root.rotation.x = this.pitch;
    this.root.rotation.z = -0.42; // cầm cần chếch sang phải để không che tầm nhìn
    this.bendShow += (this.bend - this.bendShow) * Math.min(1, dt * 10);
    const b = this.bendShow;
    this.pivots[0].rotation.x = -b * 0.12;
    this.pivots[1].rotation.x = -b * 0.38;
    this.pivots[2].rotation.x = -b * 0.55;
    this.reel.rotation.x += this.spin * dt;
  }
}

/** Dây câu: dải băng luôn quay về camera, độ rộng bù theo khoảng cách để luôn nhìn thấy. */
export class Line {
  constructor(n = 30, width = 0.02) {
    this.n = n;
    this.w = width;
    const pos = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._c = new THREE.Vector3();
  }

  update(a, b, sag, camPos) {
    const arr = this.geo.attributes.position.array;
    const c = this._c.copy(a).add(b).multiplyScalar(0.5);
    c.y -= sag;
    for (let i = 0; i < this.n; i++) {
      const u = i / (this.n - 1), iu = 1 - u;
      const p = this._p.set(0, 0, 0).addScaledVector(a, iu * iu).addScaledVector(c, 2 * u * iu).addScaledVector(b, u * u);
      const t = this._t.copy(c).sub(a).multiplyScalar(2 * iu).addScaledVector(this._v.copy(b).sub(c), 2 * u);
      const toCam = this._v.copy(camPos).sub(p);
      const dist = toCam.length();
      const s = this._s.crossVectors(t, toCam).normalize().multiplyScalar((this.w * Math.max(1, dist / 7)) / 2);
      arr[i * 6] = p.x + s.x;
      arr[i * 6 + 1] = p.y + s.y;
      arr[i * 6 + 2] = p.z + s.z;
      arr[i * 6 + 3] = p.x - s.x;
      arr[i * 6 + 4] = p.y - s.y;
      arr[i * 6 + 5] = p.z - s.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export function buildBobber() {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lam('#e8402a'));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lam('#ffffff'));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5), lam('#e8402a'));
  stick.position.y = 0.26;
  g.add(bottom, top, stick);
  g.scale.setScalar(1.7);
  return g;
}

export function buildShadow() {
  const geo = new THREE.CircleGeometry(1, 14);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#06202e', transparent: true, opacity: 0.32, depthWrite: false }));
  m.renderOrder = 2;
  m.visible = false;
  return m;
}
