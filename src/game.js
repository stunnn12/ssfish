// Điều phối: trạng thái game, chuyển cảnh cảng ↔ điểm câu ↔ đi biển, mua bán, nâng cấp, lưu game.
import { sdk } from './sdk.js';
import { audio } from './audio.js';
import { BALANCE, RODS, STORAGE, SKIN_BY_ID, BAIT_BY_ID, FISH_BY_ID, regionById, rarityIndex } from './data.js';
import * as L from './logic.js';
import { rollWeather } from './world.js';
import { rand, fmt, niceRound, weightedPick } from './util.js';
import { I } from './ui/dom.js';

export const game = {
  state: null,
  stage: null,
  fishing: null,
  ui: null,
  mode: 'boot',
  paused: false,
  input: { down: false },
  travel: null,
  _saveT: null,
};

// ---------- lưu ----------
game.saveNow = function () {
  clearTimeout(this._saveT);
  this._saveT = null;
  if (this.state) sdk.saveData(this.state);
};
game.saveSoon = function () {
  clearTimeout(this._saveT);
  this._saveT = setTimeout(() => this.saveNow(), 700);
};

// ---------- hình ảnh trang bị ----------
game.applyVisuals = function () {
  const s = this.state;
  const skin = SKIN_BY_ID[s.skin];
  this.stage.setBoat(L.bestBoat(s).id, skin?.color || null);
  this.stage.setRodColor(RODS[s.rodLevel - 1].color);
};

// ---------- chuyển cảnh ----------
game.enterSpot = function (spotId) {
  const s = this.state;
  const region = regionById(s.region);
  const spot = region.spots.find(sp => sp.id === spotId) || region.spots[0];
  s.spot = spot.id;
  s.atPort = false;
  this.stage.placeAtSpot(spot);
  this.fishing.reset();
  this.mode = 'fishing';
  this.ui.hud.setMode('fishing');
  this.saveSoon();
};

game.enterPort = function () {
  const s = this.state;
  s.atPort = true;
  this.fishing.reset();
  this.stage.placeAtPort();
  this.mode = 'port';
  this.ui.hud.setMode('port');
  L.ensureQuests(s);
  this.ui.openPort();
  this.saveSoon();
};

game.goPort = function () {
  if (this.mode !== 'fishing') return;
  const st = this.fishing.state;
  if (st === 'reel' || st === 'land' || st === 'result') return this.ui.hud.toast('Đang kéo cá, chưa về cảng được!', 'warn');
  this.mode = 'transition';
  this.ui.closeAll();
  this.ui.fade(() => this.enterPort());
};

game.goSpot = function (spotId) {
  this.mode = 'transition';
  this.ui.fade(() => {
    this.ui.closeAll();
    this.enterSpot(spotId);
    const spot = regionById(this.state.region).spots.find(sp => sp.id === spotId);
    this.ui.hud.toast(`${spot.name}: ${spot.desc}`);
  });
};

// ---------- đi biển ----------
game.travelTo = function (to) {
  const s = this.state;
  if (to === s.region || to > L.maxRegionReachable(s)) return;
  const dur = L.travelTime(s, s.region, to);
  this.mode = 'transition';
  this.ui.fade(() => {
    this.ui.closeAll();
    this.fishing.reset();
    this.stage.startTravel();
    this.travel = { from: s.region, to, t: 0, dur, eventAt: rand(0.35, 0.65), eventDone: false, hold: false, storm: false };
    this.mode = 'travel';
    this.ui.hud.setMode('travel');
    audio.play('horn');
  });
};

game.updateTravel = function (dt) {
  const tr = this.travel;
  if (!tr) return;
  const fast = this.input.down && !this.ui.modalOpen;
  const mult = tr.hold ? 0 : fast ? 2.2 : 1;
  tr.t += dt * mult;
  this.stage.travel.speed = 14 * mult * (tr.storm ? 0.7 : 1);
  const prog = Math.min(1, tr.t / tr.dur);
  this.ui.hud.setTravel(`Đang tới ${regionById(tr.to).port}${tr.storm ? ' (đi vòng tránh bão)' : ''}`, prog);
  if (!tr.eventDone && prog >= tr.eventAt) {
    tr.eventDone = true;
    if (Math.random() < BALANCE.travel.eventChance) this.seaEvent();
  }
  if (tr.t >= tr.dur && !tr.arriving) {
    tr.arriving = true;
    this.arrive();
  }
};

game.seaEvent = function () {
  const s = this.state, tr = this.travel, T = BALANCE.travel;
  const kind = weightedPick(['school', 'chest', 'storm'], k => T[k]);
  const reg = regionById(tr.to);
  tr.hold = true;
  let ev;
  if (kind === 'school') {
    s.buffs.school = T.schoolCasts;
    ev = { title: 'Gặp đàn cá!', text: `Một đàn cá lớn bơi theo thuyền. ${T.schoolCasts} lượt câu tiếp theo cá cắn gần như ngay lập tức.`, ic: I.fish };
    audio.play('rare');
  } else if (kind === 'chest') {
    if (Math.random() < 0.5) {
      const coins = niceRound(reg.avgCoin * rand(3, 6));
      s.coins += coins;
      ev = { title: 'Rương trôi!', text: `Bạn vớt được một rương gỗ: +${fmt(coins)} xu.`, ic: I.chest };
    } else {
      const opts = [['gold', 2], ['glow', 3], ['shrimp', 10]];
      const [id, n] = opts[Math.floor(Math.random() * opts.length)];
      s.baits[id] = (s.baits[id] || 0) + n;
      ev = { title: 'Rương trôi!', text: `Trong rương có ${n} ${BAIT_BY_ID[id].name}.`, ic: I.chest };
    }
    audio.play('chest');
  } else {
    tr.storm = true;
    tr.dur += (tr.dur - tr.t) * T.stormDelay;
    ev = { title: 'Bão ập tới!', text: 'Sóng lớn, thuyền phải đi vòng – chuyến đi lâu hơn một chút.', ic: I.storm };
    audio.play('thunder');
  }
  this.ui.hud.refresh();
  this.ui.showEvent(ev, () => { tr.hold = false; });
  this.saveSoon();
};

game.arrive = function () {
  const s = this.state, tr = this.travel;
  this.mode = 'transition';
  this.ui.fade(() => {
    this.stage.endTravel();
    s.region = tr.to;
    const region = regionById(tr.to);
    s.spot = region.spots[0].id;
    this.stage.setRegion(region);
    rollWeather(s, 'sun');
    this.travel = null;
    this.enterPort();
    this.ui.hud.toast(`Đã tới ${region.port} – ${region.name}`);
    this.saveNow();
  });
};

// ---------- câu được cá ----------
game.onLanded = function (data) {
  const s = this.state;
  const { fish, size, length, perfect, night } = data;
  const dex = L.recordDex(s, fish, size, length);
  s.stats.caught++;
  if (perfect) s.stats.perfect++;
  if (s.tut < 3) s.tut = 3;
  const quests = L.questEvent(s, { type: 'catch', fish, size, perfect, night });
  const miles = L.checkMilestones(s);
  const skins = L.checkSkins(s);
  sdk.sendScore(L.dexCount(s));
  audio.play(rarityIndex(fish.rarity) >= 2 ? 'rare' : 'catch');
  if (dex.isNew) audio.play('newSpecies');

  const need = BALANCE.sizes[size].slots;
  const canKeep = L.freeSlots(s) >= need;
  let swap = null;
  if (!canKeep) {
    const sorted = [...s.inventory].sort((a, b) => a.value - b.value);
    const remove = [];
    let free = L.freeSlots(s), sum = 0;
    for (const it of sorted) {
      if (free >= need) break;
      remove.push(it);
      free += BALANCE.sizes[it.size].slots;
      sum += it.value;
    }
    if (free >= need && sum < data.value) {
      swap = { items: remove, value: sum, name: remove.length === 1 ? `con ${FISH_BY_ID[remove[0].id].name}` : `${remove.length} con rẻ nhất` };
    }
  }

  this.ui.showResult({ ...data, dex, canKeep, swap }, choice => {
    if (choice === 'keep' || choice === 'swap') {
      if (choice === 'swap' && swap) s.inventory = s.inventory.filter(it => !swap.items.includes(it));
      s.inventory.push({ id: fish.id, size, value: data.value, len: length, perfect, t: Date.now() });
      audio.play('coin');
    } else {
      this.ui.hud.toast('Đã thả cá về biển');
    }
    this.fishing.afterResult();
    for (const q of quests) this.ui.hud.toast(`Hoàn thành nhiệm vụ: ${q.text}! Nhận thưởng ở cảng.`, 'good');
    for (const mi of miles) this.ui.hud.toast(`Mốc Fishdex ${mi.n} loài: +${fmt(mi.coins)} xu!`, 'good');
    for (const sk of skins) this.ui.hud.toast(`Mở khóa skin thuyền: ${sk.name}!`, 'good');
    if (quests.length || miles.length || skins.length) audio.play('quest');
    if (L.freeSlots(s) <= 0) this.ui.hud.toast('Kho đầy! Về cảng để bán cá.', 'warn');
    this.ui.hud.refresh();
    this.saveNow();
  });
  this.ui.hud.refresh();
};

// ---------- cửa hàng ----------
function pay(cost) {
  const s = game.state;
  if (s.coins < cost) {
    audio.play('deny');
    game.ui.hud.toast('Không đủ xu!', 'bad');
    return false;
  }
  s.coins -= cost;
  return true;
}

game.sell = function (items) {
  if (!items.length) return;
  const s = this.state;
  const total = L.sellItems(s, items);
  const done = L.questEvent(s, { type: 'sell', value: total });
  audio.play('coin');
  this.ui.hud.toast(`Bán ${items.length} con cá: +${fmt(total)} xu`, 'good');
  for (const q of done) this.ui.hud.toast(`Hoàn thành nhiệm vụ: ${q.text}!`, 'good');
  this.ui.hud.refresh();
  this.saveNow();
};

game.buyBait = function (b, qty) {
  const s = this.state;
  const cost = L.baitPrice(b, s.region) * qty;
  if (!pay(cost)) return;
  if (b.type === 'permanent') s.lure = true;
  else s.baits[b.id] = (s.baits[b.id] || 0) + b.pack * qty;
  audio.play('buy');
  this.ui.hud.toast(`Đã mua ${b.type === 'permanent' ? b.name : `${b.pack * qty} ${b.name}`}`, 'good');
  this.ui.hud.refresh();
  this.saveNow();
};

game.equipBait = function (id) {
  if (L.baitCount(this.state, id) <= 0) return;
  this.state.bait = id;
  this.ui.hud.refresh();
  this.saveSoon();
};

game.upgradeRod = function () {
  const s = this.state;
  const next = RODS[s.rodLevel];
  if (!next || !pay(next.price)) return;
  s.rodLevel++;
  this.stage.setRodColor(next.color);
  audio.play('buy');
  this.ui.hud.toast(`Nâng cấp thành ${next.name} (Lực ${next.power})!`, 'good');
  this.ui.hud.refresh();
  this.saveNow();
};

game.upgradeStorage = function () {
  const s = this.state;
  const next = STORAGE[s.storageLevel];
  if (!next || !pay(next.price)) return;
  s.storageLevel++;
  audio.play('buy');
  this.ui.hud.toast(`Kho chứa mở rộng: ${next.slots} ô`, 'good');
  this.ui.hud.refresh();
  this.saveNow();
};

game.buyBoat = function (b) {
  const s = this.state;
  if (s.boats.includes(b.id) || !L.boatRequirement(s, b).ok || !pay(b.price)) return;
  s.boats.push(b.id);
  this.applyVisuals();
  audio.play('horn');
  this.ui.hud.toast(`Đã mua ${b.name}! Mở bản đồ để tới ${regionById(b.region).name}.`, 'good');
  L.ensureQuests(s);
  this.ui.hud.refresh();
  this.saveNow();
};

game.setSkin = function (id) {
  const s = this.state;
  if (!s.skins.includes(id)) s.skins.push(id);
  s.skin = id;
  this.applyVisuals();
  this.saveSoon();
};

game.claimQuest = function (q) {
  const got = L.claimQuest(this.state, q);
  if (!got) return;
  audio.play('chest');
  this.ui.hud.toast(`Nhận thưởng nhiệm vụ: +${fmt(got)} xu`, 'good');
  this.ui.hud.refresh();
  this.saveNow();
};

game.releaseItem = function (it) {
  const s = this.state;
  s.inventory = s.inventory.filter(x => x !== it);
  audio.play('splash', { v: 0.4 });
  this.ui.hud.refresh();
  this.saveSoon();
};

// ---------- nhập liệu ----------
game.press = function () {
  if (this.paused || this.ui.modalOpen) return;
  if (this.mode === 'fishing') {
    const before = this.fishing.state;
    this.fishing.down();
    if (before === 'bite' && this.fishing.state === 'reel' && this.state.tut < 2) {
      this.state.tut = 2;
      this.ui.hud.fishState('reel', { over: this.fishing.reel?.over > 0 });
    }
  }
};

game.releasePress = function () {
  if (this.mode === 'fishing') {
    const before = this.fishing.state;
    this.fishing.up();
    if (before === 'charge' && this.state.tut < 1) this.state.tut = 1;
  }
};
