import * as THREE from 'three';
import { createWater, waveHeight } from './water.js';
import { createSky, createClouds } from './sky.js';
import { buildIsland, SPOT_DIST } from './island.js';
import { buildBoat, buildFisher, disposeBoat } from './boat.js';
import { Rod, Line, buildBobber, buildShadow } from './tackle.js';
import { Effects } from './effects.js';
import { buildFishModel, disposeModel } from './fishModels.js';
import { lam } from './materials.js';
import { clamp, smoothstep, rand } from '../util.js';

const C = h => new THREE.Color(h);
const NIGHT_TOP = C('#0a1330'), NIGHT_HOR = C('#1d2d55');
const SUNSET_HOR = C('#ff9a5a'), SUNSET_TOP = C('#5a5aa8');
const RAIN_GREY = C('#9aa6b2'), STORM_GREY = C('#5e6a78');
const SUN_WARM = C('#ffb070'), SUN_WHITE = C('#fff4e0'), MOON = C('#9ab4ff');
const WHITE = C('#ffffff');

const ease = u => 1 - Math.pow(1 - u, 3);

/** Toàn bộ phần 3D: cảnh, camera, ánh sáng ngày/đêm, thời tiết, thuyền, dụng cụ câu, cá trưng bày. */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#cfefff', 90, 340);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#3a5a6a', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.0);
    this.scene.add(this.sun, this.sun.target);
    this.showLight = new THREE.PointLight('#ffffff', 0, 14, 1.2);
    this.showLight.position.set(0.8, 1.4, -2.2);
    this.camera.add(this.showLight);

    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.clouds = createClouds();
    this.scene.add(this.clouds);
    this.water = createWater();
    this.scene.add(this.water.mesh);
    this.effects = new Effects(this.scene);

    this.rig = new THREE.Group();
    this.rig.rotation.order = 'YXZ';
    this.scene.add(this.rig);
    this.boatHolder = new THREE.Group();
    this.rig.add(this.boatHolder);
    this.fisher = buildFisher();
    this.rig.add(this.fisher.group);
    this.rod = new Rod();
    this.fisher.hand.add(this.rod.root);
    this.line = new Line();
    this.scene.add(this.line.mesh);
    this.bobber = buildBobber();
    this.scene.add(this.bobber);
    this.shadow = buildShadow();
    this.scene.add(this.shadow);
    this.lineState = { visible: true, sag: 0.2, color: new THREE.Color('#ffffff') };

    this.time = 0;
    this.amp = 0.55;
    this.cloud = 0;
    this.flash = 0;
    this.nextLightning = 5;
    this.onThunder = null;
    this.mode = 'fish';
    this.boatPos = new THREE.Vector3();
    this.boatYaw = 0;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.boatInfo = null;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.shakeAmt = 0;
    this.aspect = 1;
    this.width = 1;
    this.height = 1;
    this.showcase = null;
    this.travel = { active: false, speed: 0, offset: new THREE.Vector2(), props: [], wakeT: 0 };
    this.env = { day: 1, night: 0 };
    this.theme = null;
    this.island = null;

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    this._sunDir = new THREE.Vector3();
    this._top = new THREE.Color();
    this._hor = new THREE.Color();
    this._grey = new THREE.Color();
    this._c = new THREE.Color();

    this.resize();
  }

  // ---------- thiết lập ----------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.fov = this.aspect < 0.85 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  get portrait() {
    return this.aspect < 0.85;
  }

  setRegion(region) {
    if (this.island) {
      this.scene.remove(this.island.group);
      this.island.dispose();
    }
    this.region = region;
    this.island = buildIsland(region);
    this.scene.add(this.island.group);
    const th = region.theme;
    this.theme = { top: C(th.skyTop), hor: C(th.horizon), deep: C(th.deep), shallow: C(th.shallow), precip: th.precip };
    this.water.uniforms.uIsland.value.set(0, 0, this.island.radius * 0.92);
    this.water.uniforms.uFoamShore.value = 0;
  }

  setBoat(id, skinColor) {
    if (this.boatInfo) {
      this.boatHolder.remove(this.boatInfo.group);
      disposeBoat(this.boatInfo.group);
    }
    this.boatInfo = buildBoat(id, skinColor);
    this.boatHolder.add(this.boatInfo.group);
    this.fisher.group.position.copy(this.boatInfo.seat);
  }

  setRodColor(c) {
    this.rod.setColor(c);
  }

  placeBoat(pos, yaw) {
    this.boatPos.copy(pos);
    this.boatYaw = yaw;
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.camInit = false;
  }

  placeAtSpot(spot) {
    const a = spot.angle;
    this.mode = 'fish';
    this.placeBoat(new THREE.Vector3(Math.cos(a) * SPOT_DIST, 0, Math.sin(a) * SPOT_DIST), Math.atan2(Math.cos(a), Math.sin(a)));
  }

  placeAtPort() {
    const p = this.island.portPos;
    this.mode = 'port';
    this.placeBoat(p, Math.atan2(p.x, p.z) + 0.9);
  }

  // ---------- chuyến đi biển ----------
  startTravel() {
    this.mode = 'travel';
    this.travel.active = true;
    this.travel.offset.set(0, 0);
    if (this.island) this.island.group.visible = false;
    this.water.uniforms.uIsland.value.set(99999, 99999, 1);
    this.placeBoat(new THREE.Vector3(0, 0, 0), 0);
    const rockCol = this.region?.theme.rock || '#8a8a8a';
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), lam(rockCol));
      const s = 3 + Math.random() * 6;
      m.scale.set(s, s * (0.6 + Math.random()), s);
      m.position.set((Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 70), -0.5, -40 - i * 45);
      this.scene.add(m);
      this.travel.props.push(m);
    }
  }

  endTravel() {
    this.travel.active = false;
    this.travel.offset.set(0, 0);
    this.water.uniforms.uOffset.value.set(0, 0);
    for (const m of this.travel.props) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.travel.props = [];
    if (this.island) {
      this.island.group.visible = true;
      this.water.uniforms.uIsland.value.set(0, 0, this.island.radius * 0.92);
    }
  }

  // ---------- tiện ích cho logic câu ----------
  wave(x, z) {
    const o = this.water.uniforms.uOffset.value;
    return waveHeight(x, z, this.time, this.amp, o.x, o.y);
  }

  tipWorld(out) {
    return this.rod.tip.getWorldPosition(out);
  }

  splash(pos, s = 1) {
    this.effects.splash(pos, s);
  }

  ripple(pos, size = 2, dur = 1.1) {
    this.effects.ripple(pos, size, dur);
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  toScreen(v, out = {}) {
    this._v.copy(v).project(this.camera);
    out.x = (this._v.x * 0.5 + 0.5) * this.width;
    out.y = (-this._v.y * 0.5 + 0.5) * this.height;
    out.on = this._v.z < 1 && Math.abs(this._v.x) < 1.2 && Math.abs(this._v.y) < 1.2;
    return out;
  }

  // ---------- cá trưng bày khi câu được ----------
  showFish(fish, fromPos) {
    this.clearShowcase();
    const model = buildFishModel(fish);
    model.position.copy(fromPos);
    model.scale.setScalar(0.6);
    this.scene.add(model);
    this.showcase = { model, t: 0, from: fromPos.clone() };
  }

  clearShowcase() {
    if (!this.showcase) return;
    this.scene.remove(this.showcase.model);
    disposeModel(this.showcase.model);
    this.showcase = null;
    this.showLight.intensity = 0;
  }

  _showcaseTarget(out) {
    const dist = 4.5;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const vw = vh * this.aspect;
    const y = this.portrait ? vh * 0.2 : vh * 0.14;
    out.set(0, y, -dist);
    this.camera.localToWorld(out);
    return Math.min(vw * 0.62, vh * 0.42);
  }

  // ---------- môi trường ----------
  applyEnv(dt, env) {
    const T = this.theme;
    if (!T) return;
    const a = ((env.hour - 6) / 12) * Math.PI;
    const sd = this._sunDir.set(Math.cos(a), Math.sin(a), -0.35).normalize();
    const day = smoothstep(-0.1, 0.22, sd.y);
    const warm = smoothstep(-0.12, 0.04, sd.y) * (1 - smoothstep(0.05, 0.4, sd.y));
    const cloudTarget = env.weather === 'storm' ? 0.92 : env.weather === 'rain' ? 0.62 : 0;
    this.cloud += (cloudTarget - this.cloud) * Math.min(1, dt * 0.5);
    const cl = this.cloud;
    const ampTarget = env.weather === 'storm' ? 1.5 : env.weather === 'rain' ? 0.85 : 0.55;
    this.amp += (ampTarget - this.amp) * Math.min(1, dt * 0.3);
    this.env.day = day;
    this.env.night = 1 - day;

    // Chớp khi có bão
    if (env.weather === 'storm' && cl > 0.6) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = rand(4, 11);
        if (this.onThunder) this.onThunder();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const fl = this.flash > 0.5 ? this.flash : this.flash * 0.3;

    const top = this._top.copy(NIGHT_TOP).lerp(T.top, day);
    const hor = this._hor.copy(NIGHT_HOR).lerp(T.hor, day);
    hor.lerp(SUNSET_HOR, warm * 0.6);
    top.lerp(SUNSET_TOP, warm * 0.25);
    const grey = this._grey.copy(cl > 0.8 ? STORM_GREY : RAIN_GREY).multiplyScalar(0.22 + 0.78 * day);
    top.lerp(grey, cl * 0.82);
    hor.lerp(grey, cl * 0.66);

    const su = this.sky.uniforms;
    su.uTop.value.copy(top);
    su.uHorizon.value.copy(hor);
    su.uBottom.value.copy(hor).multiplyScalar(0.8);
    su.uSunDir.value.copy(sd);
    su.uMoonDir.value.set(-sd.x, -sd.y, 0.35).normalize();
    su.uSunColor.value.copy(SUN_WHITE).lerp(SUN_WARM, warm);
    su.uNight.value = 1 - day;
    su.uCloudy.value = cl;
    su.uFlash.value = fl;

    this.scene.fog.color.copy(hor);
    this.scene.fog.near = 90 - 50 * cl;
    this.scene.fog.far = 340 - 170 * cl;

    // Mặt trời / mặt trăng
    const lightDir = day > 0.02 ? sd : this._v2.set(-sd.x, -sd.y, 0.35).normalize();
    const lc = this._c.copy(day > 0.02 ? SUN_WHITE : MOON);
    if (day > 0.02) lc.lerp(SUN_WARM, warm);
    this.sun.color.copy(lc);
    this.sun.intensity = (day * 2.3 + (1 - day) * 0.45) * (1 - cl * 0.55);
    this.sun.position.copy(this.boatPos).addScaledVector(lightDir, 80);
    this.sun.target.position.copy(this.boatPos);
    this.hemi.color.copy(top).lerp(WHITE, 0.5);
    this.hemi.groundColor.copy(T.deep).multiplyScalar(0.6);
    this.hemi.intensity = (0.55 + 0.95 * day) * (1 - cl * 0.25) + fl * 2.5;

    const wu = this.water.uniforms;
    const dim = (0.28 + 0.72 * day) * (1 - cl * 0.35);
    wu.uDeep.value.copy(T.deep).multiplyScalar(dim);
    wu.uShallow.value.copy(T.shallow).multiplyScalar(dim);
    wu.uSunDir.value.copy(lightDir);
    wu.uSunColor.value.copy(lc).multiplyScalar(this.sun.intensity * 0.42);
    wu.uAmbient.value.copy(this.hemi.color).multiplyScalar(0.55 * (0.5 + 0.5 * day) + fl);
    wu.uFogColor.value.copy(hor);
    wu.uFogNear.value = 60 - 30 * cl;
    wu.uFogFar.value = 262 - 80 * cl;
    wu.uAmp.value = this.amp;

    const cm = this.clouds.userData.mat;
    cm.color.copy(WHITE).multiplyScalar(0.3 + 0.7 * day).lerp(grey, cl * 0.7);
    cm.emissive.copy(hor).multiplyScalar(0.25);
  }

  // ---------- vòng lặp ----------
  update(dt, env) {
    this.time += dt;
    this.applyEnv(dt, env);
    const wu = this.water.uniforms;
    wu.uTime.value = this.time;

    // Chuyến đi: cuộn mặt nước và đá trôi qua
    if (this.travel.active) {
      const sp = this.travel.speed;
      this.travel.offset.y -= sp * dt;
      wu.uOffset.value.copy(this.travel.offset);
      for (const m of this.travel.props) {
        m.position.z += sp * dt;
        if (m.position.z > 40) {
          m.position.z -= 320;
          m.position.x = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 70);
        }
      }
      this.travel.wakeT -= dt;
      if (this.travel.wakeT <= 0 && sp > 1) {
        this.travel.wakeT = 0.06;
        const L = (this.boatInfo?.length || 4) / 2;
        for (const s of [-1, 1]) {
          const p = this._v.copy(this.boatPos).addScaledVector(this.forward, -L).addScaledVector(this.right, s * 0.8);
          p.y = this.wave(p.x, p.z);
          this.effects.splash(p, 0.1, 2);
        }
        this.travel.rippleN = (this.travel.rippleN || 0) + 1;
        if (this.travel.rippleN % 5 === 0) {
          const bow = this._v.copy(this.boatPos).addScaledVector(this.forward, L * 0.8);
          bow.y = this.wave(bow.x, bow.z);
          this.effects.ripple(bow, 2.2, 0.8);
        }
      }
    }

    // Mặt nước bám theo thuyền (theo bước lưới để sóng không trượt)
    const cell = this.water.cell;
    this.water.mesh.position.set(Math.round(this.boatPos.x / cell) * cell, 0, Math.round(this.boatPos.z / cell) * cell);

    // Thuyền dập dềnh
    const B = this.boatPos, f = this.forward, r = this.right;
    const h = this.wave(B.x, B.z);
    const hf = this.wave(B.x + f.x * 1.6, B.z + f.z * 1.6), hb = this.wave(B.x - f.x * 1.6, B.z - f.z * 1.6);
    const hr = this.wave(B.x + r.x * 1.0, B.z + r.z * 1.0), hl = this.wave(B.x - r.x * 1.0, B.z - r.z * 1.0);
    const sub = this.boatInfo?.length > 6 ? 0.25 : 0;
    this.rig.position.set(B.x, h * 0.8 - 0.05 - sub, B.z);
    this.rig.rotation.set(Math.atan2(hf - hb, 3.2) * 0.8, this.boatYaw, Math.atan2(hr - hl, 2.0) * 0.7);
    this.rod.update(dt);

    // Camera
    const des = this._v.copy(B), look = this._v2.copy(B);
    const P = this.portrait;
    if (this.mode === 'port') {
      des.addScaledVector(f, -14).addScaledVector(r, 3).add(new THREE.Vector3(0, P ? 9 : 7, 0));
      look.set(0, 3, 0).lerp(B, 0.35);
    } else if (this.mode === 'travel') {
      des.add(new THREE.Vector3(P ? 7 : 8, P ? 6 : 4.5, P ? 13 : 10));
      look.addScaledVector(f, 8).add(new THREE.Vector3(0, 0.5, 0));
    } else {
      const reel = this.mode === 'reel';
      const big = Math.max(0, (this.boatInfo?.length || 3.4) - 3.4);
      const back = (P ? 9.5 : 7.2) * (reel ? 0.92 : 1) + big * 0.5;
      const up = (P ? 5.2 : 3.8) + big * 0.45;
      des.addScaledVector(f, -back).addScaledVector(r, 1.1);
      des.y += up;
      look.addScaledVector(f, 17).addScaledVector(r, 0.6);
      look.y += P ? -1.6 : -0.4;
    }
    if (!this.camInit) {
      this.camPos.copy(des);
      this.camLook.copy(look);
      this.camInit = true;
    }
    const k = 1 - Math.exp(-dt * 3);
    this.camPos.lerp(des, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.position.y += h * 0.25;
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 8);
    }
    this.camera.lookAt(this.camLook);
    this.sky.mesh.position.copy(this.camera.position);
    this.camera.updateMatrixWorld();
    this.rig.updateMatrixWorld(true);

    // Phao to dần theo khoảng cách để luôn dễ nhìn
    const bd = this.bobber.position.distanceTo(this.camera.position);
    this.bobber.scale.setScalar(clamp(bd * 0.085, 0.9, 3.0));

    // Dây câu
    const ls = this.lineState;
    this.line.mesh.visible = ls.visible;
    if (ls.visible) {
      this.tipWorld(this._tip);
      const end = this._v.copy(this.bobber.position);
      end.y += 0.4 * this.bobber.scale.y;
      this.line.update(this._tip, end, ls.sag, this.camera.position);
      this.line.mat.color.copy(ls.color);
    }

    // Cá trưng bày
    if (this.showcase) {
      const s = this.showcase;
      s.t += dt;
      const u = Math.min(1, s.t / 0.85);
      const target = new THREE.Vector3();
      const size = this._showcaseTarget(target);
      s.model.position.lerpVectors(s.from, target, ease(u));
      s.model.position.y += Math.sin(Math.PI * u) * 2.5;
      s.model.scale.setScalar(0.6 + (size - 0.6) * ease(u));
      s.model.rotation.set(Math.sin(s.t * 1.3) * 0.15, -0.5 + s.t * 0.9, Math.sin(s.t * 2.1) * 0.1);
      this.showLight.intensity = 9 * ease(u);
    }

    if (this.island) this.island.update(dt, this.time, this.env.night);
    this.clouds.rotation.y += dt * 0.004;

    const precip = this.theme?.precip || 'rain';
    let intensity = env.weather === 'storm' ? 1 : env.weather === 'rain' ? 0.55 : 0;
    if (precip === 'ash') intensity = Math.max(intensity, 0.3);
    this.effects.update(dt, {
      camera: this.camera,
      wave: (x, z) => this.wave(x, z),
      precip,
      intensity: intensity * clamp(this.cloud / 0.6, precip === 'ash' ? 1 : 0, 1),
      wind: env.weather === 'storm' ? 9 : 2,
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
