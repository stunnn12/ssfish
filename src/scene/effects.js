import * as THREE from 'three';

const dummy = new THREE.Object3D();

/** Bọt nước, gợn sóng, mưa / tuyết / tro bụi. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Hạt bọt nước
    this.N = 110;
    this.parts = [];
    this.inst = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.N);
    this.inst.frustumCulled = false;
    for (let i = 0; i < this.N; i++) {
      this.parts.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 });
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      this.inst.setMatrixAt(i, dummy.matrix);
    }
    this.next = 0;
    scene.add(this.inst);

    // Gợn sóng
    const rg = new THREE.RingGeometry(0.8, 1, 28);
    rg.rotateX(-Math.PI / 2);
    this.ripples = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.ripples.push({ m, t: 0, dur: 1, size: 1 });
    }
    this.rippleNext = 0;

    // Mưa (đoạn thẳng)
    this.RN = 700;
    this.drops = new Float32Array(this.RN * 3);
    const rpos = new Float32Array(this.RN * 6);
    for (let i = 0; i < this.RN; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * 60;
      this.drops[i * 3 + 1] = Math.random() * 30;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: '#d8e8ff', transparent: true, opacity: 0.5, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Tuyết / tro (điểm)
    this.SN = 600;
    const spos = new Float32Array(this.SN * 3);
    for (let i = 0; i < this.SN; i++) {
      spos[i * 3] = (Math.random() - 0.5) * 60;
      spos[i * 3 + 1] = Math.random() * 30;
      spos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.2, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
    this.t = 0;
  }

  splash(pos, strength = 1, count) {
    const n = count ?? Math.round(6 + 10 * strength);
    for (let k = 0; k < n; k++) {
      const p = this.parts[this.next];
      this.next = (this.next + 1) % this.N;
      p.p.copy(pos);
      p.p.x += (Math.random() - 0.5) * 0.4;
      p.p.z += (Math.random() - 0.5) * 0.4;
      const a = Math.random() * Math.PI * 2;
      const r = (0.8 + Math.random() * 1.6) * (0.6 + strength * 0.5);
      p.v.set(Math.cos(a) * r, 2.5 + Math.random() * 3 * (0.5 + strength * 0.6), Math.sin(a) * r);
      p.max = p.life = 0.6 + Math.random() * 0.5;
      p.s = 0.6 + Math.random() * 0.9 * (0.6 + strength * 0.4);
    }
  }

  ripple(pos, size = 2, dur = 1.1) {
    const r = this.ripples[this.rippleNext];
    this.rippleNext = (this.rippleNext + 1) % this.ripples.length;
    r.m.position.copy(pos);
    r.t = 0;
    r.dur = dur;
    r.size = size;
    r.m.visible = true;
  }

  /** ctx: {camera, wave(x,z), precip: 'rain'|'snow'|'ash', intensity 0..1, wind} */
  update(dt, ctx) {
    this.t += dt;
    let alive = false;
    for (let i = 0; i < this.N; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      alive = true;
      p.life -= dt;
      p.v.y -= 11 * dt;
      p.p.addScaledVector(p.v, dt);
      const wy = ctx.wave(p.p.x, p.p.z);
      if (p.p.y < wy - 0.1 && p.v.y < 0) p.life = 0;
      const s = p.life > 0 ? p.s * Math.min(1, (p.life / p.max) * 2) : 0;
      dummy.position.copy(p.p);
      dummy.rotation.set(p.life * 7, p.life * 5, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.inst.setMatrixAt(i, dummy.matrix);
    }
    if (alive || this._wasAlive) this.inst.instanceMatrix.needsUpdate = true;
    this._wasAlive = alive;

    for (const r of this.ripples) {
      if (!r.m.visible) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.m.visible = false;
        continue;
      }
      const s = 0.2 + r.size * (1 - Math.pow(1 - u, 2));
      r.m.scale.setScalar(s);
      r.m.position.y = ctx.wave(r.m.position.x, r.m.position.z) + 0.06;
      r.m.material.opacity = 0.7 * (1 - u);
    }

    const cam = ctx.camera.position;
    const I = ctx.intensity;
    const isRain = ctx.precip === 'rain' && I > 0.01;
    this.rain.visible = isRain;
    if (isRain) {
      const arr = this.rain.geometry.attributes.position.array;
      const speed = 22 + 10 * I;
      const wind = ctx.wind || 0;
      const count = Math.floor(this.RN * Math.min(1, 0.35 + I * 0.65));
      for (let i = 0; i < this.RN; i++) {
        let x = this.drops[i * 3], y = this.drops[i * 3 + 1], z = this.drops[i * 3 + 2];
        y -= speed * dt;
        x += wind * dt;
        if (y < -2) y += 30;
        if (x > 30) x -= 60;
        this.drops[i * 3] = x;
        this.drops[i * 3 + 1] = y;
        const on = i < count;
        const bx = cam.x + x, by = cam.y - 8 + y, bz = cam.z + z;
        arr[i * 6] = bx;
        arr[i * 6 + 1] = on ? by : -999;
        arr[i * 6 + 2] = bz;
        arr[i * 6 + 3] = bx - wind * 0.03;
        arr[i * 6 + 4] = on ? by - 0.7 : -999;
        arr[i * 6 + 5] = bz;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.25 + 0.35 * I;
    }

    const isFlake = (ctx.precip === 'snow' || ctx.precip === 'ash') && I > 0.01;
    this.snow.visible = isFlake;
    if (isFlake) {
      const ash = ctx.precip === 'ash';
      this.snow.material.color.set(ash ? '#8a7f7c' : '#ffffff');
      this.snow.material.size = ash ? 0.16 : 0.22;
      this.snow.material.opacity = 0.35 + 0.55 * I;
      const arr = this.snow.geometry.attributes.position.array;
      const fall = ash ? 0.9 : 1.6 + 2.5 * I;
      const wind = (ctx.wind || 0) * 0.4;
      for (let i = 0; i < this.SN; i++) {
        let y = arr[i * 3 + 1] - fall * dt;
        if (y < cam.y - 10) y += 30;
        arr[i * 3 + 1] = y;
        arr[i * 3] += (Math.sin(this.t * 0.8 + i) * 0.4 + wind) * dt;
        if (arr[i * 3] - cam.x > 30) arr[i * 3] -= 60;
        if (arr[i * 3] - cam.x < -30) arr[i * 3] += 60;
        if (arr[i * 3 + 2] - cam.z > 30) arr[i * 3 + 2] -= 60;
        if (arr[i * 3 + 2] - cam.z < -30) arr[i * 3 + 2] += 60;
        if (y > cam.y + 20) arr[i * 3 + 1] = cam.y - 9;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }
}
