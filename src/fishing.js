// Vòng câu: quăng cần (giữ tích lực) → chờ cá cắn (chạm trong 0,6 s) → kéo cá (thanh căng dây) → kết quả.
import * as THREE from 'three';
import { BALANCE, RODS, BAIT_BY_ID } from './data.js';
import { rollFish, rollSize, rollLength, catchValue } from './logic.js';
import { isNight } from './world.js';
import { createReel, stepReel } from './reel.js';
import { audio } from './audio.js';
import { clamp, rand, lerp } from './util.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');
const YELLOW = new THREE.Color('#ffd23a');
const RED = new THREE.Color('#ff3b30');

export function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* không hỗ trợ */
  }
}

export class Fishing {
  constructor(game) {
    this.g = game;
    this.state = 'idle';
    this.t = 0;
    this.power = 0;
    this.castPower = 0;
    this.castFrom = new THREE.Vector3();
    this.castPoint = new THREE.Vector3();
    this.bob = new THREE.Vector3();
    this.dip = 0;
    this.dipTarget = 0;
    this.reel = null;
    this.fish = null;
    this.size = 1;
    this.perfect = false;
  }

  get st() {
    return this.g.stage;
  }
  get s() {
    return this.g.state;
  }
  get hud() {
    return this.g.ui.hud;
  }

  reset() {
    const st = this.st;
    this.state = 'idle';
    this.reel = null;
    this.fish = null;
    if (st.mode === 'reel') st.mode = 'fish';
    st.shadow.visible = false;
    st.bobber.visible = true;
    st.lineState.visible = true;
    st.rod.pitchTarget = st.rod.rest;
    st.rod.bend = 0.05;
    st.rod.spin = 0;
    this.hud.fishState('idle');
  }

  get busy() {
    return this.state !== 'idle';
  }

  down() {
    if (this.state === 'idle') this.startCharge();
    else if (this.state === 'wait') this.earlyTap();
    else if (this.state === 'bite') this.hook();
  }

  up() {
    if (this.state === 'charge') this.release();
  }

  /** Thu dây khi chưa có cá. */
  cancel() {
    if (this.state === 'wait' || this.state === 'bite' || this.state === 'fly' || this.state === 'charge') {
      audio.play('reel');
      this.reset();
    }
  }

  startCharge() {
    this.state = 'charge';
    this.chargeT = 0;
    this.power = 0;
    this.hud.fishState('charge');
  }

  release() {
    const st = this.st;
    const p = Math.max(0.05, this.power);
    this.castPower = p;
    const dist = lerp(BALANCE.cast.minDist, BALANCE.cast.maxDist, p);
    st.tipWorld(this.castFrom);
    this.castPoint
      .copy(st.boatPos)
      .addScaledVector(st.forward, dist + (st.boatInfo?.length || 3) / 2)
      .addScaledVector(st.right, rand(-2.5, 2.5));
    this.flyT = 0;
    this.flyDur = 0.55 + p * 0.45;
    this.arc = 3 + p * 6;
    this.state = 'fly';
    this.s.stats.casts++;
    audio.play('cast');
    this.hud.fishState('fly');
  }

  waterPos(out = V2) {
    out.copy(this.bob);
    out.y = this.st.wave(out.x, out.z);
    return out;
  }

  land() {
    const st = this.st, s = this.s;
    this.state = 'wait';
    this.bob.copy(this.castPoint);
    const p = this.waterPos();
    st.splash(p, 0.7);
    st.ripple(p, 2.2);
    audio.play('splash', { v: 0.7 });
    const bait = BAIT_BY_ID[s.bait] || BAIT_BY_ID.worm;
    let w = rand(BALANCE.bite.waitMin, BALANCE.bite.waitMax) * bait.waitMult;
    if (s.buffs.school > 0) w = Math.max(0.6, w * BALANCE.bite.schoolWaitMult);
    this.waitT = w;
    this.nextNibble = this.t + rand(0.8, 2.0);
    this.lastEarly = -9;
    this.dip = 0;
    this.dipTarget = 0;
    this.hud.fishState('wait');
  }

  bite() {
    const s = this.s, st = this.st;
    const night = isNight(s);
    this.fish = rollFish({ region: s.region, spot: s.spot, bait: s.bait, night, weather: s.weather.kind, power: this.castPower });
    this.size = rollSize();
    if (s.buffs.school > 0) {
      s.buffs.school--;
      this.hud.refresh();
    }
    this.state = 'bite';
    this.biteT = 0;
    this.dipTarget = 0.6;
    const p = this.waterPos();
    st.splash(p, 0.5);
    st.ripple(p, 1.6, 0.8);
    audio.play('bite');
    vibrate(35);
    this.hud.fishState('bite');
  }

  missBite() {
    const bait = BAIT_BY_ID[this.s.bait] || BAIT_BY_ID.worm;
    this.state = 'wait';
    this.dipTarget = 0;
    this.waitT = rand(2, 5) * bait.waitMult;
    this.fish = null;
    audio.play('escape');
    this.hud.toast('Hụt rồi! Cá đã bỏ đi…', 'warn');
    this.hud.fishState('wait');
  }

  earlyTap() {
    if (this.t - this.lastEarly < 0.35) return;
    this.lastEarly = this.t;
    this.waitT += BALANCE.bite.earlyTapPenalty;
    this.dip = 0.14;
    audio.play('early');
    this.hud.floatText('Chưa cắn!', 'muted');
  }

  hook() {
    const s = this.s;
    this.perfect = this.biteT <= BALANCE.bite.perfectWindow;
    const b = BAIT_BY_ID[s.bait];
    if (b && b.type === 'consumable') {
      s.baits[b.id] = Math.max(0, (s.baits[b.id] || 0) - 1);
      if (s.baits[b.id] === 0) {
        s.bait = 'worm';
        this.hud.toast(`Hết ${b.name} – chuyển về Giun đất`);
      }
    }
    audio.play('hook');
    vibrate(20);
    if (this.perfect) {
      audio.play('perfect');
      this.hud.floatText('Móc chuẩn! +10%', 'gold');
    }
    this.hud.refresh();
    this.startReel();
    this.g.saveSoon();
  }

  startReel() {
    const s = this.s, fish = this.fish;
    const r = createReel({
      difficulty: fish.difficulty,
      legendary: fish.rarity === 'legendary',
      size: this.size,
      rod: RODS[s.rodLevel - 1],
      castPower: this.castPower,
    }, BALANCE.reel);
    // phần chỉ dùng cho hình ảnh/âm thanh
    Object.assign(r, { strainBeep: 0, tick: 0, lat: 0, swimSide: 1, splashT: 0 });
    this.reel = r;
    this.state = 'reel';
    this.st.mode = 'reel';
    this.hud.fishState('reel', { over: r.over > 0 });
  }

  updateReel(dt) {
    const r = this.reel, R = BALANCE.reel, st = this.st;
    const holding = this.g.input.down;
    const ev = stepReel(r, R, dt, holding);
    const thrash = r.thrashLeft > 0;

    // Hình ảnh & âm thanh theo sự kiện vật lý
    if (ev === 'warn') audio.play('warn');
    if (ev === 'thrash') {
      r.swimSide = Math.random() < 0.5 ? -1 : 1;
      audio.play('thrash');
      st.shake(0.18);
      vibrate(25);
    }
    if (thrash) {
      r.splashT -= dt;
      if (r.splashT <= 0) {
        r.splashT = 0.22;
        st.splash(this.waterPos(), 0.55);
      }
    }
    if (r.red) {
      r.strainBeep -= dt;
      if (r.strainBeep <= 0) {
        r.strainBeep = 0.16;
        audio.play('strain');
      }
    }
    if (holding) {
      r.tick += r.reeled;
      if (r.tick > 0.5) {
        r.tick = 0;
        audio.play('reel');
      }
      st.rod.spin = 14 * r.eff;
    } else {
      st.rod.spin = -5;
    }
    st.rod.bend = 0.15 + r.T * 0.95 + (thrash ? 0.2 : 0);
    st.rod.pitchTarget = st.rod.rest + 0.15 + r.T * 0.35;

    // Vị trí phao / cá theo quãng dây còn lại
    const L = (st.boatInfo?.length || 3) / 2;
    const near = V.copy(st.boatPos).addScaledVector(st.forward, L + 1.5);
    const ratio = clamp(r.D / r.D0, 0, 1.6);
    const latTarget = Math.sin(this.t * 0.9 + r.phase) * 2.2 + (thrash ? r.swimSide * 3.5 : 0);
    r.lat += (latTarget - r.lat) * Math.min(1, dt * 2.2);
    this.bob.lerpVectors(near, this.castPoint, ratio).addScaledVector(st.right, r.lat * Math.min(1, r.D / 10));
    const wy = st.wave(this.bob.x, this.bob.z);
    this.bob.y = wy - 0.22 - (thrash ? 0.18 : 0);
    st.bobber.position.copy(this.bob);
    st.bobber.rotation.set(Math.sin(this.t * 9) * (thrash ? 0.4 : 0.12), 0, Math.cos(this.t * 7) * (thrash ? 0.4 : 0.1));

    const sh = st.shadow;
    sh.visible = true;
    const away = V2.copy(this.bob).sub(near).setY(0).normalize();
    sh.position.copy(this.bob).addScaledVector(away, 1.3);
    sh.position.y = st.wave(sh.position.x, sh.position.z) + 0.05;
    const fl = 0.9 + this.size * 0.4;
    sh.scale.set(fl * 0.4, 1, fl);
    sh.rotation.y = Math.atan2(away.x, away.z) + r.lat * 0.08 + (thrash ? Math.sin(this.t * 20) * 0.3 : 0);

    st.lineState.sag = (1 - Math.min(1, r.T)) * 1.8;
    const lc = st.lineState.color;
    if (r.T < R.greenMax) lc.copy(WHITE);
    else if (r.T < R.redMin) lc.copy(WHITE).lerp(YELLOW, (r.T - R.greenMax) / (R.redMin - R.greenMax));
    else lc.copy(RED);

    if (ev === 'snap') return this.snap();
    if (ev === 'escape') return this.escape();
    if (ev === 'landed') return this.landFish();
    this.hud.setReel({ T: r.T, D: r.D, D0: r.D0, maxD: r.maxD, strain: r.strain / r.tol, thrash, warned: r.warned, holding });
  }

  snap() {
    const over = this.reel.over > 0;
    this.s.stats.lost++;
    audio.play('snap');
    vibrate([40, 30, 60]);
    this.st.shake(0.35);
    this.hud.toast(over ? 'Đứt dây! Cá quá khỏe – cần Lực cần ≥ Độ khó − 2. Hãy nâng cấp cần.' : 'Đứt dây! Thả tay khi dây vào vùng đỏ.', 'bad');
    this.reset();
  }

  escape() {
    audio.play('escape');
    this.hud.toast('Cá đã thoát! Đừng thả dây chùng quá lâu.', 'warn');
    this.reset();
  }

  landFish() {
    const st = this.st, s = this.s;
    const fish = this.fish, size = this.size;
    const length = rollLength(fish, size);
    const value = catchValue(fish, size, this.perfect);
    const p = this.waterPos(new THREE.Vector3());
    st.splash(p, 1.3);
    st.ripple(p, 3.2);
    st.showFish(fish, p);
    st.shadow.visible = false;
    st.lineState.visible = false;
    st.bobber.visible = false;
    st.rod.bend = 0.05;
    st.rod.spin = 0;
    st.rod.pitchTarget = st.rod.rest + 0.6;
    st.mode = 'fish';
    audio.play('splash', { v: 1.2 });
    this.state = 'land';
    this.landT = 0;
    this.resultShown = false;
    this.catchData = { fish, size, length, value, perfect: this.perfect, night: isNight(s) };
    this.hud.fishState('land');
  }

  /** Gọi khi người chơi đã chọn xong ở bảng kết quả. */
  afterResult() {
    this.st.clearShowcase();
    this.reset();
  }

  floatBobber(dt) {
    const st = this.st;
    this.dip += (this.dipTarget - this.dip) * Math.min(1, dt * 12);
    if (this.state === 'wait') this.dipTarget = 0;
    const wy = st.wave(this.bob.x, this.bob.z);
    this.bob.y = wy - this.dip;
    st.bobber.position.copy(this.bob);
    const shake = this.state === 'bite' ? Math.sin(this.t * 40) * 0.35 : 0;
    st.bobber.rotation.set(Math.sin(this.t * 1.3) * 0.12 + shake, 0, Math.cos(this.t * 1.1) * 0.12);
  }

  update(dt) {
    this.t += dt;
    const st = this.st;
    st.tipWorld(V);
    switch (this.state) {
      case 'idle': {
        this.bob.copy(V);
        this.bob.y -= 1.0;
        st.bobber.position.copy(this.bob);
        st.bobber.rotation.set(Math.sin(this.t * 2) * 0.12, 0, Math.cos(this.t * 1.7) * 0.12);
        st.lineState.sag = 0.02;
        st.lineState.color.copy(WHITE);
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        const x = (this.chargeT * BALANCE.cast.chargeSpeed) % 2;
        this.power = x < 1 ? x : 2 - x;
        st.rod.pitchTarget = st.rod.rest + 0.2 + this.power * 0.9;
        this.bob.copy(V);
        this.bob.y -= 1.0;
        st.bobber.position.copy(this.bob);
        this.hud.setPower(this.power);
        break;
      }
      case 'fly': {
        this.flyT += dt / this.flyDur;
        const u = Math.min(1, this.flyT);
        st.rod.pitchTarget = this.flyT < 0.3 ? st.rod.rest - 0.65 : st.rod.rest;
        this.bob.lerpVectors(this.castFrom, this.castPoint, u);
        this.bob.y = lerp(this.castFrom.y, st.wave(this.castPoint.x, this.castPoint.z), u) + Math.sin(Math.PI * u) * this.arc;
        st.bobber.position.copy(this.bob);
        st.lineState.sag = 0.15;
        if (u >= 1) this.land();
        break;
      }
      case 'wait': {
        this.floatBobber(dt);
        st.lineState.sag = 1.4;
        this.waitT -= dt;
        if (this.waitT <= 0) this.bite();
        else if (this.t >= this.nextNibble && this.waitT > 0.7) {
          this.nextNibble = this.t + rand(1.0, 2.6);
          this.dip = Math.max(this.dip, 0.2);
          st.ripple(this.waterPos(), 0.8, 0.7);
          audio.play('nibble');
        }
        break;
      }
      case 'bite': {
        this.floatBobber(dt);
        st.lineState.sag = 0.6;
        this.biteT += dt;
        if (this.biteT > BALANCE.bite.window) this.missBite();
        break;
      }
      case 'reel':
        this.updateReel(dt);
        break;
      case 'land': {
        this.landT += dt;
        if (this.landT > 0.95 && !this.resultShown) {
          this.resultShown = true;
          this.state = 'result';
          this.g.onLanded(this.catchData);
        }
        break;
      }
      default:
        break;
    }
  }
}
