import { h, icon, I } from './dom.js';
import { BALANCE, BAIT_BY_ID, regionById } from '../data.js';
import { capacity, usedSlots, baitCount, dexCount } from '../logic.js';
import { clockText, isNight, weatherName } from '../world.js';
import { fmt } from '../util.js';

const DESKTOP = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const HOLD = DESKTOP ? 'Giữ chuột (hoặc phím Space)' : 'Giữ ngón tay trên màn hình';

export class Hud {
  constructor(game, root) {
    this.g = game;
    this.el = h('div.hud');
    root.append(this.el);

    // --- thanh trên ---
    this.coinsEl = h('b');
    this.regEl = h('span.reg');
    this.clockEl = h('span');
    this.wxIcon = h('span.ic');
    this.wxEl = h('span');
    this.dexBadge = h('i.badge');
    this.bagEl = h('span.lbl');
    this.btnDex = h('button.hbtn', { onclick: () => game.ui.openFishdex(), 'aria-label': 'Fishdex' }, icon(I.book), h('span.lbl', null, 'Fishdex'), this.dexBadge);
    this.btnBag = h('button.hbtn', { onclick: () => game.ui.openInventory(), 'aria-label': 'Kho cá' }, icon(I.bag), this.bagEl);
    this.btnPort = h('button.hbtn.port', { onclick: () => game.goPort(), 'aria-label': 'Về cảng' }, icon(I.anchor), h('span.lbl', null, 'Về cảng'));
    this.el.append(
      h('div.top', null,
        h('div.tl', null,
          h('div.pill.coins', null, icon(I.coin), this.coinsEl),
          h('div.pill.info', null, this.regEl, h('span.clock', null, icon(I.clock), this.clockEl), h('span.wx', null, this.wxIcon, this.wxEl))),
        h('div.tr', null, this.btnDex, this.btnBag, this.btnPort)),
    );
    this.buffEl = h('div.buffs');
    this.el.append(this.buffEl);

    // --- phao "!" ---
    this.bubble = h('div.bubble', null, '!');
    this.el.append(this.bubble);

    // --- lực quăng ---
    this.powerFill = h('div.fill');
    this.powerEl = h('div.power', null, h('div.plabel', null, h('span', null, 'Lực quăng'), h('span.far', null, 'Nước sâu →')), h('div.pbar', null, this.powerFill));

    // --- kéo cá ---
    const R = BALANCE.reel;
    const pct = v => `${(v * 100).toFixed(1)}%`;
    this.needle = h('div.needle');
    this.alertEl = h('div.talert', null, '!!');
    this.tension = h('div.tension', null,
      h('div.zones', null,
        h('div.z.low', { style: { width: pct(R.greenMin) } }),
        h('div.z.green', { style: { width: pct(R.greenMax - R.greenMin) } }),
        h('div.z.yellow', { style: { width: pct(R.redMin - R.greenMax) } }),
        h('div.z.red', { style: { width: pct(1 - R.redMin) } })),
      this.needle, this.alertEl);
    this.distEl = h('span.dist');
    this.overEl = h('span.over', null, 'Cá quá khỏe so với cần!');
    this.trackFish = h('div.tfish', null, icon(I.fish));
    this.track = h('div.track', null, h('div.tboat', null, icon(I.boat)), h('div.tline'), this.trackFish, h('div.tend', null, 'sổng'));
    this.strainFill = h('div.sfill');
    this.reelEl = h('div.reel', null,
      h('div.rtop', null, this.distEl, this.overEl),
      this.track, this.tension,
      h('div.strain', null, h('span', null, 'Độ bền dây'), h('div.sbar', null, this.strainFill)));

    // --- dưới ---
    this.hintEl = h('div.hint');
    this.baitDot = h('span.dot');
    this.baitName = h('span.name');
    this.baitCnt = h('span.cnt');
    this.baitBtn = h('button.bait', { onclick: () => game.ui.openBaitPicker(), 'aria-label': 'Đổi mồi' }, this.baitDot, this.baitName, this.baitCnt);
    this.cancelBtn = h('button.cancel', { onclick: () => game.fishing.cancel() }, icon(I.back), 'Thu cần');
    this.el.append(h('div.bottom', null, this.powerEl, this.reelEl, this.hintEl, h('div.brow', null, this.baitBtn, this.cancelBtn)));

    // --- chuyến đi ---
    this.travelTitle = h('div.ttitle');
    this.travelFill = h('div.tfill');
    this.travelEl = h('div.travel', null, this.travelTitle, h('div.tbar', null, this.travelFill), h('div.thint', null, 'Giữ để tăng tốc'));
    this.el.append(this.travelEl);

    this.toasts = h('div.toasts');
    this.floats = h('div.floats');
    this.el.append(this.toasts, this.floats);

    this.tick = 0;
    this.state = 'idle';
    this.el.dataset.fs = 'idle';
    this.setMode('fishing');
  }

  setMode(mode) {
    this.el.dataset.mode = mode;
    this.refresh();
  }

  refresh() {
    const s = this.g.state;
    if (!s) return;
    this.coinsEl.textContent = fmt(s.coins);
    const region = regionById(s.region);
    const spot = region.spots.find(sp => sp.id === s.spot);
    const mode = this.el.dataset.mode;
    this.regEl.textContent = mode === 'port' ? region.port : mode === 'travel' ? 'Trên biển' : `${region.name} · ${spot ? spot.name : ''}`;
    this.dexBadge.textContent = dexCount(s);
    const used = usedSlots(s), cap = capacity(s);
    this.bagEl.textContent = `${used}/${cap}`;
    this.btnBag.classList.toggle('full', used >= cap);
    this.btnPort.classList.toggle('pulse', used >= cap && mode === 'fishing');
    const b = BAIT_BY_ID[s.bait] || BAIT_BY_ID.worm;
    this.baitDot.style.background = b.color;
    this.baitName.textContent = b.name;
    const n = baitCount(s, b.id);
    this.baitCnt.textContent = n === Infinity ? '∞' : `×${n}`;
    this.buffEl.replaceChildren(...(s.buffs.school > 0 ? [h('div.buff', null, icon(I.fish), `Đàn cá: ${s.buffs.school} lượt câu nhanh`)] : []));
    this.updateClock();
  }

  updateClock() {
    const s = this.g.state;
    this.clockEl.textContent = clockText(s);
    const kind = this.g.travel?.storm ? 'storm' : s.weather.kind;
    const precip = regionById(s.region).theme.precip;
    const night = isNight(s);
    this.wxIcon.innerHTML = kind === 'storm' ? I.storm : kind === 'rain' ? (precip === 'snow' ? I.snow : I.rain) : night ? I.moon : I.sun;
    this.wxEl.textContent = kind === 'sun' ? (night ? 'Đêm' : 'Nắng') : weatherName(kind, precip) + (night ? ' · đêm' : '');
  }

  update(dt) {
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      this.updateClock();
    }
    if (this.state === 'bite') {
      const p = this.g.stage.toScreen(this.g.stage.bobber.position);
      this.bubble.style.transform = `translate(${p.x}px, ${p.y - 46}px) translate(-50%, -100%)`;
    }
  }

  fishState(state, extra = {}) {
    this.state = state;
    this.el.dataset.fs = state;
    const s = this.g.state;
    const tut = s ? s.tut : 3;
    const hints = {
      idle: tut < 1 ? `${HOLD} để tích lực, thả ra để quăng cần` : 'Giữ để tích lực · thả để quăng',
      charge: 'Thả tay! Quăng xa → nước sâu, dễ gặp cá hiếm',
      fly: '',
      wait: tut < 2 ? 'Chờ phao bị kéo chìm hẳn rồi CHẠM thật nhanh!' : 'Chờ cá cắn câu…',
      bite: 'CHẠM NGAY!',
      reel: tut < 3 ? 'GIỮ để cuộn dây · THẢ khi cá vùng vẫy (!!) · giữ kim ở vùng xanh' : 'Giữ để cuộn · thả khi cá vùng vẫy',
      land: '',
      result: '',
    };
    this.hintEl.textContent = hints[state] ?? '';
    this.hintEl.classList.toggle('loud', state === 'bite');
    this.overEl.style.display = extra.over ? '' : 'none';
    if (state === 'charge') this.setPower(0);
  }

  setPower(p) {
    this.powerFill.style.width = `${(p * 100).toFixed(1)}%`;
    this.powerEl.classList.toggle('max', p > 0.9);
  }

  setReel(r) {
    const R = BALANCE.reel;
    this.needle.style.left = `${(Math.min(1, r.T) * 100).toFixed(1)}%`;
    const red = r.T >= R.redMin, green = r.T >= R.greenMin && r.T <= R.greenMax;
    this.tension.classList.toggle('red', red);
    this.tension.classList.toggle('green', green);
    this.tension.classList.toggle('warn', r.warned || r.thrash);
    this.alertEl.textContent = r.thrash ? 'VÙNG VẪY!' : '!!';
    this.distEl.textContent = `Còn ${Math.max(0, Math.ceil(r.D))} m`;
    const u = Math.min(1, Math.max(0, r.D / r.maxD));
    this.trackFish.style.left = `${(u * 100).toFixed(1)}%`;
    this.track.classList.toggle('danger', r.D > r.D0);
    this.strainFill.style.width = `${(Math.min(1, r.strain) * 100).toFixed(1)}%`;
    this.strainFill.classList.toggle('danger', r.strain > 0.5);
  }

  setTravel(title, progress) {
    this.travelTitle.textContent = title;
    this.travelFill.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  toast(text, type = 'info') {
    const t = h('div.toast.' + type, null, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3200);
  }

  floatText(text, cls = '') {
    const f = h('div.float' + (cls ? '.' + cls : ''), null, text);
    this.floats.append(f);
    setTimeout(() => f.remove(), 1300);
  }
}
