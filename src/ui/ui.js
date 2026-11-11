import { h, icon, I } from './dom.js';
import { Hud } from './hud.js';
import {
  BALANCE, BAITS, BOATS, RODS, STORAGE, SKINS, REGIONS, FISH, FISH_BY_ID, RARITY_ORDER,
  regionById, rarityInfo, CONDITION_TEXT, MAX_REGION,
} from '../data.js';
import {
  previewSale, fatigueCount, fatigueMult, baitPrice, baitCount, bestBoat, capacity, usedSlots,
  boatRequirement, travelTime, dexCount, regionDexCount, nextMilestone, skinUnlocked, maxRegionReachable,
} from '../logic.js';
import { thumbInto } from '../scene/thumbs.js';
import { audio } from '../audio.js';
import { fmt } from '../util.js';

const rarityTag = r => h('span.rtag', { style: { '--rc': rarityInfo(r).color } }, rarityInfo(r).name);
const condIcon = c => (c === 'night' ? I.moon : c === 'rain' ? I.rain : c === 'storm' ? I.storm : null);
const coinTxt = n => [icon(I.coin, 'sm'), fmt(n)];

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.hud = new Hud(game, this.root);
    this.layer = h('div.modals');
    this.fadeEl = h('div.fade');
    this.root.append(this.layer, this.fadeEl);
    this.stack = [];
    this.portTab = 'sell';
    this.dexRegion = 1;
    this.root.addEventListener('click', e => {
      if (e.target.closest('button')) audio.play('click');
    });
  }

  get modalOpen() {
    return this.stack.length > 0;
  }

  // ---------- khung bảng ----------
  modal({ title, cls = '', closable = true, onClose } = {}) {
    const back = h('div.mback');
    const titleEl = h('h2', null, title || '');
    const body = h('div.mbody');
    const foot = h('div.mfoot');
    const m = { back, body, foot, titleEl, closed: false };
    const close = () => {
      if (m.closed) return;
      m.closed = true;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 220);
      this.stack = this.stack.filter(x => x !== m);
      if (onClose) onClose();
    };
    m.close = close;
    const panel = h('div.panel', { class: cls },
      h('header', null, titleEl, closable ? h('button.x', { onclick: close, 'aria-label': 'Đóng' }, icon(I.close)) : null),
      body, foot);
    m.panel = panel;
    back.append(panel);
    if (closable) back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    this.layer.append(back);
    requestAnimationFrame(() => back.classList.add('in'));
    this.stack.push(m);
    return m;
  }

  closeAll() {
    for (const m of [...this.stack]) m.close();
  }

  fade(fn) {
    return new Promise(resolve => {
      this.fadeEl.classList.add('on');
      setTimeout(async () => {
        try {
          await fn();
        } finally {
          setTimeout(() => this.fadeEl.classList.remove('on'), 60);
          resolve();
        }
      }, 300);
    });
  }

  // ---------- màn hình tiêu đề ----------
  showTitle(onStart) {
    const s = this.g.state;
    const has = s.stats.casts > 0;
    const el = h('div.title',
      null,
      h('div.logo', null, h('div.l1', null, 'Đảo Câu Cá'), h('div.l2', null, 'Tiny Tides')),
      h('div.tsub', null, has ? `${dexCount(s)}/${FISH.length} loài · ${fmt(s.coins)} xu` : '100 loài cá · 5 vùng biển · săn cá huyền thoại'),
      h('button.btn.primary.big', null, icon(I.play), has ? 'Tiếp tục' : 'Chơi ngay'),
      h('div.tfoot', null, 'Giữ để quăng · chạm khi phao giật · giữ/thả để kéo cá'));
    const go = () => {
      el.removeEventListener('pointerup', go);
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
      onStart();
    };
    el.addEventListener('pointerup', go);
    this.root.append(el);
  }

  // ---------- cảng ----------
  openPort() {
    const s = this.g.state;
    const region = regionById(s.region);
    const m = this.modal({ title: region.port, cls: 'port wide', closable: false });
    const tabs = [
      ['sell', 'Chợ cá', I.coin],
      ['bait', 'Mồi', I.worm],
      ['up', 'Nâng cấp', I.rod],
      ['boat', 'Thuyền', I.boat],
      ['quest', 'Nhiệm vụ', I.gift],
    ];
    const tabBar = h('div.tabs');
    const content = h('div.tabc');
    m.body.append(tabBar, content);
    m.panel.querySelector('header').append(
      h('button.x.dexbtn', { onclick: () => this.openFishdex(), 'aria-label': 'Fishdex' }, icon(I.book)));
    const render = () => {
      const claim = (s.quests?.list || []).filter(q => q.p >= q.n && !q.claimed).length;
      tabBar.replaceChildren(...tabs.map(([id, name, ic]) =>
        h('button.tab' + (this.portTab === id ? '.on' : ''), { onclick: () => { this.portTab = id; render(); } },
          icon(ic), h('span', null, name), id === 'quest' && claim ? h('i.badge', null, claim) : null)));
      const sc = content.scrollTop;
      content.replaceChildren(this['port_' + this.portTab](render));
      content.scrollTop = sc;
      this.hud.refresh();
    };
    m.foot.append(
      h('button.btn.ghost', { onclick: () => this.openMap() }, icon(I.map), 'Bản đồ'),
      h('button.btn.primary', { onclick: () => this.openSpotPicker() }, 'Ra khơi', icon(I.play)));
    this.portRender = render;
    this.portModal = m;
    render();
  }

  refreshPort() {
    if (this.portModal && !this.portModal.closed) this.portRender();
  }

  port_sell(render) {
    const s = this.g.state;
    if (!s.inventory.length) {
      return h('div.empty', null, icon(I.fish, 'big'), h('p', null, 'Kho đang trống. Ra khơi câu cá rồi quay về bán nhé!'));
    }
    const groups = new Map();
    for (const it of s.inventory) {
      if (!groups.has(it.id)) groups.set(it.id, []);
      groups.get(it.id).push(it);
    }
    const list = h('div.list');
    const sorted = [...groups.entries()].sort((a, b) => previewSale(s, b[1]) - previewSale(s, a[1]));
    for (const [id, items] of sorted) {
      const f = FISH_BY_ID[id];
      const fat = fatigueCount(s, id);
      const img = h('img.thumb', { alt: '' });
      thumbInto(img, f);
      const sizes = [0, 0, 0, 0];
      items.forEach(it => sizes[it.size]++);
      list.append(h('div.row', null, img,
        h('div.rinfo', null,
          h('div.rname', null, f.name, h('span.cnt', null, ` ×${items.length}`)),
          h('div.rsub', null, rarityTag(f.rarity),
            sizes.map((n, i) => (n ? h('span.chip', null, `${BALANCE.sizes[i].name} ${n}`) : null)),
            fat ? h('span.fat', null, `giá −${Math.round((1 - fatigueMult(fat)) * 100)}%`) : null)),
        h('button.btn.sm.gold', { onclick: () => { this.g.sell(items); render(); } }, ...coinTxt(previewSale(s, items)))));
    }
    return h('div', null,
      h('div.sellall', null,
        h('div', null, h('div.big', null, `${s.inventory.length} con cá trong kho`),
          h('div.muted', null, 'Bán liên tục cùng một loài giảm 5%/con (tối đa −30%), hồi lại sau 1 ngày trong game.')),
        h('button.btn.gold', { onclick: () => { this.g.sell([...s.inventory]); render(); } }, 'Bán tất cả', ...coinTxt(previewSale(s, s.inventory)))),
      list);
  }

  port_bait(render) {
    const s = this.g.state;
    const list = h('div.list');
    for (const b of BAITS) {
      const n = baitCount(s, b.id);
      const price = baitPrice(b, s.region);
      const using = s.bait === b.id;
      const mults = RARITY_ORDER.slice(1).map(r => {
        const v = b.mult[r] ?? 1;
        const nv = b.nightMult?.[r];
        if (v === 1 && !nv) return null;
        return h('span.chip', { style: { '--rc': rarityInfo(r).color } }, `${rarityInfo(r).name} ×${String(nv ?? v).replace('.', ',')}${nv ? ' (đêm)' : ''}`);
      });
      const buttons = [];
      if (b.type === 'consumable') {
        buttons.push(h('button.btn.sm.gold', { disabled: s.coins < price ? true : null, onclick: () => { this.g.buyBait(b, 1); render(); } },
          b.pack > 1 ? `Mua ${b.pack}` : 'Mua 1', ...coinTxt(price)));
        if (b.pack === 1) buttons.push(h('button.btn.sm.gold', { disabled: s.coins < price * 5 ? true : null, onclick: () => { this.g.buyBait(b, 5); render(); } }, 'Mua 5', ...coinTxt(price * 5)));
      } else if (b.type === 'permanent' && !s.lure) {
        buttons.push(h('button.btn.sm.gold', { disabled: s.coins < price ? true : null, onclick: () => { this.g.buyBait(b, 1); render(); } }, 'Mua', ...coinTxt(price)));
      }
      if (n > 0) buttons.push(using ? h('span.using', null, icon(I.check, 'sm'), 'Đang dùng') : h('button.btn.sm', { onclick: () => { this.g.equipBait(b.id); render(); } }, 'Dùng'));
      list.append(h('div.row' + (using ? '.on' : ''), null,
        h('div.bdot', { style: { background: b.color } }, icon(I.worm)),
        h('div.rinfo', null,
          h('div.rname', null, b.name, h('span.cnt', null, n === Infinity ? ' ∞' : ` ×${n}`)),
          h('div.rsub', null, b.desc),
          h('div.rsub', null, mults, b.waitMult < 1 ? h('span.chip', null, `Cắn nhanh ${Math.round((1 - b.waitMult) * 100)}%`) : null)),
        h('div.bcol', null, buttons)));
    }
    const reg = regionById(s.region);
    return h('div', null, h('p.muted.pad', null, `Mồi nhân tỉ lệ các nhóm hiếm rồi chuẩn hóa lại về 100%. Giá mồi tiêu hao ở ${reg.name} ×${reg.baitPriceMult}.`), list);
  }

  port_up(render) {
    const s = this.g.state;
    const rod = RODS[s.rodLevel - 1], next = RODS[s.rodLevel];
    const st = STORAGE[s.storageLevel - 1], nextSt = STORAGE[s.storageLevel];
    const reg = regionById(s.region);
    const boat = bestBoat(s);
    const stat = (k, v) => h('div.stat', null, h('span', null, k), h('b', null, v));
    const rodCard = h('div.card', null,
      h('div.chead', null, icon(I.rod), h('div', null, h('div.ctitle', null, `Cần câu · cấp ${rod.level}/${RODS.length}`), h('div.cname', null, rod.name))),
      h('div.stats', null, stat('Lực kéo', rod.power), stat('Chịu vùng đỏ', `${String(rod.redTolerance).replace('.', ',')} s`), stat('Tốc độ cuộn', `${String(rod.reelSpeed).replace('.', ',')} m/s`)),
      next
        ? h('div.next', null,
          h('div', null, h('div.muted', null, 'Cấp tiếp theo'), h('b', null, `${next.name} · Lực ${next.power}`)),
          h('button.btn.gold', { disabled: s.coins < next.price ? true : null, onclick: () => { this.g.upgradeRod(); render(); } }, 'Nâng cấp', ...coinTxt(next.price)))
        : h('div.next', null, h('b', null, 'Đã đạt cấp tối đa!')),
      h('p.muted', null, `Cá ở ${reg.name} có độ khó ${reg.difficulty[0]}–${reg.difficulty[1]}. Cần Lực ≥ Độ khó − 2 mới kéo lên được.`));
    const stCard = h('div.card', null,
      h('div.chead', null, icon(I.bag), h('div', null, h('div.ctitle', null, `Kho chứa · cấp ${st.level}/${STORAGE.length}`), h('div.cname', null, `${st.slots} ô${boat.extraSlots ? ` + ${boat.extraSlots} ô thuyền` : ''}`))),
      h('div.stats', null, stat('Đang dùng', `${usedSlots(s)}/${capacity(s)}`), stat('Cá Khổng lồ', '2 ô')),
      nextSt
        ? h('div.next', null,
          h('div', null, h('div.muted', null, 'Cấp tiếp theo'), h('b', null, `${nextSt.slots} ô`)),
          h('button.btn.gold', { disabled: s.coins < nextSt.price ? true : null, onclick: () => { this.g.upgradeStorage(); render(); } }, 'Nâng cấp', ...coinTxt(nextSt.price)))
        : h('div.next', null, h('b', null, 'Đã đạt cấp tối đa!')));
    return h('div.cards', null, rodCard, stCard);
  }

  port_boat(render) {
    const s = this.g.state;
    const list = h('div.list');
    for (const b of BOATS) {
      const owned = s.boats.includes(b.id);
      const reg = regionById(b.region);
      const req = boatRequirement(s, b);
      const released = b.region <= MAX_REGION;
      let action;
      if (owned) action = h('span.using', null, icon(I.check, 'sm'), 'Đã có');
      else if (!released) action = h('span.muted', null, 'Sắp ra mắt');
      else if (!req.ok) action = h('div.req', null, icon(I.lock, 'sm'), `Bắt ≥${req.need} loài ở ${req.region.name} (${req.have}/${req.need})`);
      else action = h('button.btn.sm.gold', { disabled: s.coins < b.price ? true : null, onclick: () => { this.g.buyBoat(b); render(); } }, 'Mua', ...coinTxt(b.price));
      list.append(h('div.row' + (owned ? '.on' : ''), null,
        h('div.bdot.boat', null, icon(I.boat)),
        h('div.rinfo', null,
          h('div.rname', null, b.name),
          h('div.rsub', null, `Đi tới vùng ${b.region}: ${reg.name}`),
          h('div.rsub', null, b.extraSlots ? h('span.chip', null, `+${b.extraSlots} ô kho`) : null, b.legTime ? h('span.chip', null, `${b.legTime} giây/chặng`) : null)),
        h('div.bcol', null, action)));
    }
    const skins = h('div.skins');
    for (const sk of SKINS) {
      const un = s.skins.includes(sk.id) || skinUnlocked(s, sk);
      const using = s.skin === sk.id;
      skins.append(h('button.skin' + (using ? '.on' : '') + (un ? '' : '.locked'), {
        onclick: () => {
          if (!un) return this.hud.toast(sk.desc, 'info');
          this.g.setSkin(sk.id);
          render();
        },
      }, h('span.sw', { style: { background: sk.color || 'linear-gradient(135deg,#c0703a,#2f7fc0)' } }, un ? null : icon(I.lock, 'sm')), h('span', null, sk.name)));
    }
    return h('div', null, h('p.muted.pad', null, 'Thuyền mở vùng biển mới (đi được vùng của nó và mọi vùng trước). Cần đủ xu và đã bắt ≥10 loài ở vùng trước.'), list,
      h('h3', null, 'Skin thuyền'), h('p.muted.pad', null, 'Mở bằng thành tích, chỉ đổi ngoại hình.'), skins);
  }

  port_quest(render) {
    const s = this.g.state;
    const list = h('div.list');
    for (const q of s.quests?.list || []) {
      const done = q.p >= q.n;
      list.append(h('div.row.quest' + (q.claimed ? '.on' : ''), null,
        h('div.bdot', null, icon(done ? I.check : I.gift)),
        h('div.rinfo', null,
          h('div.rname', null, q.text),
          h('div.qbar', null, h('div.qfill', { style: { width: `${Math.min(100, (q.p / q.n) * 100)}%` } })),
          h('div.rsub', null, `${fmt(Math.min(q.p, q.n))}/${fmt(q.n)}`)),
        h('div.bcol', null, q.claimed
          ? h('span.using', null, 'Đã nhận')
          : h('button.btn.sm.gold', { disabled: done ? null : true, onclick: () => { this.g.claimQuest(q); render(); } }, 'Nhận', ...coinTxt(q.reward)))));
    }
    const nm = nextMilestone(s);
    const dc = dexCount(s);
    return h('div', null,
      h('h3', null, 'Nhiệm vụ hằng ngày'), h('p.muted.pad', null, 'Làm mới mỗi ngày. Thưởng theo vùng cao nhất bạn đã mở.'), list,
      h('h3', null, 'Mốc Fishdex'),
      nm
        ? h('div.card', null, h('div.rname', null, `Bắt đủ ${nm.n} loài: +${fmt(nm.coins)} xu`), h('div.qbar', null, h('div.qfill', { style: { width: `${Math.min(100, (dc / nm.n) * 100)}%` } })), h('div.rsub', null, `${dc}/${nm.n} loài`))
        : h('div.card', null, h('b', null, 'Đã hoàn thành Fishdex!')),
      h('h3', null, 'Thống kê'),
      h('div.stats.wide', null,
        h('div.stat', null, h('span', null, 'Cá đã câu'), h('b', null, fmt(s.stats.caught))),
        h('div.stat', null, h('span', null, 'Móc chuẩn'), h('b', null, fmt(s.stats.perfect))),
        h('div.stat', null, h('span', null, 'Tổng xu kiếm được'), h('b', null, fmt(s.stats.earned))),
        h('div.stat', null, h('span', null, 'Đứt dây'), h('b', null, fmt(s.stats.lost)))));
  }

  // ---------- chọn điểm câu ----------
  openSpotPicker() {
    const s = this.g.state;
    const region = regionById(s.region);
    const m = this.modal({ title: `Ra khơi · ${region.name}` });
    const list = h('div.spots');
    for (const sp of region.spots) {
      const favs = sp.favor.map(id => FISH_BY_ID[id]).map(f => (s.dex[f.id] ? f.name : '???'));
      list.append(h('button.spot', { onclick: () => { m.close(); this.g.goSpot(sp.id); } },
        icon(I.pin),
        h('div', null, h('div.rname', null, sp.name), h('div.rsub', null, sp.desc), h('div.rsub.fav', null, 'Hay gặp: ' + favs.join(', ')))));
    }
    m.body.append(list);
  }

  // ---------- bản đồ ----------
  openMap() {
    const s = this.g.state;
    const m = this.modal({ title: 'Bản đồ biển', cls: 'wide' });
    const reach = maxRegionReachable(s);
    const wrap = h('div.map');
    REGIONS.forEach((r, i) => {
      const here = r.id === s.region;
      const released = r.id <= MAX_REGION;
      const ok = released && r.id <= reach;
      const boatNeed = BOATS.find(b => b.region === r.id);
      const t = Math.round(travelTime(s, s.region, r.id));
      let action;
      if (here) action = h('span.using', null, icon(I.pin, 'sm'), 'Đang ở đây');
      else if (!released) action = h('span.muted', null, 'Sắp ra mắt');
      else if (ok) action = h('button.btn.sm.primary', { onclick: () => { this.closeAll(); this.g.travelTo(r.id); } }, `Đi tới · ~${t} giây`);
      else action = h('div.req', null, icon(I.lock, 'sm'), `Cần ${boatNeed.name}`);
      wrap.append(h('div.island' + (here ? '.here' : '') + (ok ? '' : '.locked'), { style: { '--ic': r.theme.deep, '--is': r.theme.shallow } },
        h('div.inum', null, r.id),
        h('div.rinfo', null,
          h('div.rname', null, r.name, h('span.muted', null, ` · ${r.port}`)),
          h('div.rsub', null, `Độ khó cá ${r.difficulty[0]}–${r.difficulty[1]} · giá gốc ${fmt(r.basePrice)} xu · ${regionDexCount(s, r.id)}/20 loài`)),
        h('div.bcol', null, action)));
      if (i < REGIONS.length - 1) wrap.append(h('div.route'));
    });
    m.body.append(h('p.muted.pad', null, 'Đảo đã mở đi lại tự do, không tốn phí. Trên đường có 30% cơ hội gặp sự kiện biển.'), wrap);
  }

  // ---------- mồi nhanh ----------
  openBaitPicker() {
    const s = this.g.state;
    if (this.g.fishing.state === 'reel' || this.g.fishing.state === 'bite') return;
    const m = this.modal({ title: 'Chọn mồi' });
    const list = h('div.list');
    for (const b of BAITS) {
      const n = baitCount(s, b.id);
      if (n <= 0) continue;
      const using = s.bait === b.id;
      list.append(h('button.row.pick' + (using ? '.on' : ''), { onclick: () => { this.g.equipBait(b.id); m.close(); } },
        h('div.bdot', { style: { background: b.color } }, icon(I.worm)),
        h('div.rinfo', null, h('div.rname', null, b.name, h('span.cnt', null, n === Infinity ? ' ∞' : ` ×${n}`)), h('div.rsub', null, b.desc))));
    }
    m.body.append(list, h('p.muted.pad', null, 'Mua thêm mồi ở cảng.'));
  }

  // ---------- kho ----------
  openInventory() {
    const s = this.g.state;
    const m = this.modal({ title: 'Kho cá' });
    const render = () => {
      const used = usedSlots(s), cap = capacity(s);
      const items = [...s.inventory].sort((a, b) => b.value - a.value);
      const list = h('div.list');
      for (const it of items) {
        const f = FISH_BY_ID[it.id];
        const img = h('img.thumb', { alt: '' });
        thumbInto(img, f);
        list.append(h('div.row', null, img,
          h('div.rinfo', null, h('div.rname', null, f.name), h('div.rsub', null, rarityTag(f.rarity), h('span.chip', null, `${BALANCE.sizes[it.size].name} · ${it.len} cm`), ...coinTxt(it.value))),
          h('button.btn.sm.ghost', { onclick: () => { this.g.releaseItem(it); render(); } }, 'Thả')));
      }
      m.body.replaceChildren(
        h('div.capbar', null, h('div.capfill' + (used >= cap ? '.full' : ''), { style: { width: `${Math.min(100, (used / cap) * 100)}%` } }), h('span', null, `${used}/${cap} ô`)),
        items.length ? list : h('div.empty', null, icon(I.fish, 'big'), h('p', null, 'Chưa có cá nào.')),
        h('p.muted.pad', null, s.atPort ? 'Bán cá ở tab Chợ cá.' : 'Kho đầy thì về cảng bán hoặc thả bớt cá. Cá Khổng lồ chiếm 2 ô.'));
    };
    render();
  }

  // ---------- Fishdex ----------
  openFishdex() {
    const s = this.g.state;
    const m = this.modal({ title: 'Fishdex', cls: 'wide dex' });
    if (s.region <= REGIONS.length) this.dexRegion = s.region;
    const render = () => {
      const dc = dexCount(s);
      const tabs = h('div.tabs.small', null, REGIONS.map(r => h('button.tab' + (this.dexRegion === r.id ? '.on' : ''), { onclick: () => { this.dexRegion = r.id; render(); } },
        h('span', null, `${r.id}. ${r.name}`), h('i.badge.soft', null, `${regionDexCount(s, r.id)}/20`))));
      const grid = h('div.grid');
      for (const f of FISH.filter(x => x.region === this.dexRegion)) {
        const e = s.dex[f.id];
        const img = h('img.thumb', { alt: '' });
        thumbInto(img, f, !e);
        const ci = condIcon(f.condition);
        grid.append(h('button.dcard' + (e ? '' : '.unk'), { style: { '--rc': rarityInfo(f.rarity).color }, onclick: () => showDetail(f) },
          img, h('div.dname', null, e ? f.name : '???'),
          h('div.dsizes', null, [0, 1, 2, 3].map(i => h('i' + (e && e.sizes[i] ? '.on' : '')))),
          ci ? h('span.cond', { html: ci }) : null,
          f.rarity === 'legendary' ? h('span.boss', null, 'BOSS') : null));
      }
      const nm = nextMilestone(s);
      m.body.replaceChildren(
        h('div.dexhead', null, h('div.big', null, `${dc}/${FISH.length} loài`), h('div.qbar', null, h('div.qfill', { style: { width: `${(dc / FISH.length) * 100}%` } })),
          nm ? h('div.muted', null, `Mốc tiếp: ${nm.n} loài → +${fmt(nm.coins)} xu`) : null),
        tabs, grid);
    };
    const showDetail = f => {
      const e = s.dex[f.id];
      const img = h('img.bigthumb', { alt: '' });
      thumbInto(img, f, !e);
      const stars = h('div.stars', null, Array.from({ length: 10 }, (_, i) => h('i' + (i < f.difficulty ? '.on' : ''))));
      m.body.replaceChildren(
        h('button.btn.sm.ghost.backbtn', { onclick: render }, icon(I.back), 'Fishdex'),
        h('div.detail', { style: { '--rc': rarityInfo(f.rarity).color } },
          img,
          h('div.dtitle', null, e ? f.name : '???'),
          h('div.rsub.center', null, rarityTag(f.rarity), h('span.chip', null, regionById(f.region).name), f.rarity === 'legendary' ? h('span.chip.boss', null, 'Cá huyền thoại') : null),
          h('div.stats.wide', null,
            h('div.stat', null, h('span', null, 'Độ khó'), stars),
            h('div.stat', null, h('span', null, 'Giá (cỡ Vừa)'), h('b', null, ...coinTxt(f.price))),
            h('div.stat', null, h('span', null, 'Xuất hiện'), h('b', null, CONDITION_TEXT[f.condition])),
            h('div.stat', null, h('span', null, 'Cần câu tối thiểu'), h('b', null, `Lực ${Math.max(1, f.difficulty - BALANCE.reel.margin)}`)),
            h('div.stat', null, h('span', null, 'Đã bắt'), h('b', null, e ? fmt(e.n) : '0')),
            h('div.stat', null, h('span', null, 'Kỷ lục'), h('b', null, e ? `${e.best} cm` : '—'))),
          h('div.sizes', null, BALANCE.sizes.map((sz, i) => h('div.size' + (e && e.sizes[i] ? '.on' : ''), null, h('b', null, sz.name), h('span', null, `×${String(sz.mult).replace('.', ',')} giá`), h('span.muted', null, e ? `${e.sizes[i]} con` : '—'))))));
    };
    render();
  }

  // ---------- kết quả câu ----------
  showResult(info, onChoice) {
    const { fish, size, length, value, perfect, dex, canKeep, swap } = info;
    const ri = rarityInfo(fish.rarity);
    const m = this.modal({ title: '', cls: 'result', closable: false });
    m.panel.style.setProperty('--rc', ri.color);
    m.titleEl.replaceWith(h('div.rhead', null, rarityTag(fish.rarity), dex.isNew ? h('span.new', null, 'MỚI!') : null, dex.record ? h('span.new.rec', null, 'KỶ LỤC') : null));
    const choose = c => { m.close(); onChoice(c); };
    m.body.append(...[
      h('div.rfish', null, fish.name),
      h('div.rsub.center', null,
        h('span.chip', null, `Cỡ ${BALANCE.sizes[size].name}`),
        h('span.chip', null, `${length} cm`),
        size === 3 ? h('span.chip.warn', null, 'Chiếm 2 ô') : null),
      h('div.rvalue', null, ...coinTxt(value), perfect ? h('span.perfect', null, 'Móc chuẩn +10%') : null),
      dex.isNew ? h('p.muted.center', null, 'Đã ghi vào Fishdex!') : dex.newSize ? h('p.muted.center', null, `Cỡ mới trong Fishdex: ${BALANCE.sizes[size].name}`) : null,
      canKeep ? null : h('p.full.center', null, 'Kho đầy!'),
    ].filter(Boolean));
    if (canKeep) {
      m.foot.append(h('button.btn.ghost', { onclick: () => choose('release') }, 'Thả lại'), h('button.btn.primary', { onclick: () => choose('keep') }, icon(I.bag), 'Cất vào kho'));
    } else {
      m.foot.append(h('button.btn.ghost', { onclick: () => choose('release') }, 'Thả lại'));
      if (swap) m.foot.append(h('button.btn.primary', { onclick: () => choose('swap') }, `Đổi lấy ${swap.name} (${fmt(swap.value)} xu)`));
    }
  }

  // ---------- sự kiện biển ----------
  showEvent({ title, text, ic }, onOk) {
    const m = this.modal({ title, cls: 'event', closable: false });
    m.body.append(h('div.evicon', null, icon(ic, 'huge')), h('p.center', null, text));
    m.foot.append(h('button.btn.primary', { onclick: () => { m.close(); onOk(); } }, 'Tiếp tục'));
  }
}
