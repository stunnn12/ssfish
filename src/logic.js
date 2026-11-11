// Luật chơi thuần (không phụ thuộc 3D/UI): chọn cá, cỡ, giá, kho, bán, Fishdex, nhiệm vụ.
import {
  BALANCE, FISH, BOATS, RODS, STORAGE, BAIT_BY_ID, SKINS, QUESTS,
  RARITY_ORDER, regionById, rarityIndex, MAX_REGION,
} from './data.js';
import { weightedPick, rand, niceRound, mulberry32, hashStr, fmt, todayKey } from './util.js';

// ---------- Trang bị ----------
export const rodOf = s => RODS[s.rodLevel - 1];
export const storageOf = s => STORAGE[s.storageLevel - 1];

export function bestBoat(s) {
  return BOATS.filter(b => s.boats.includes(b.id)).sort((a, b) => b.region - a.region)[0] || BOATS[0];
}
export const capacity = s => storageOf(s).slots + bestBoat(s).extraSlots;
export const usedSlots = s => s.inventory.reduce((n, it) => n + BALANCE.sizes[it.size].slots, 0);
export const freeSlots = s => capacity(s) - usedSlots(s);
export const maxRegionReachable = s => Math.min(MAX_REGION, bestBoat(s).region);

// ---------- Gặp cá ----------
export function isConditionMet(cond, ctx) {
  switch (cond) {
    case 'night': return ctx.night;
    case 'rain': return ctx.weather === 'rain' || ctx.weather === 'storm';
    case 'storm': return ctx.weather === 'storm';
    default: return true;
  }
}

export function baitMult(bait, rarity, night) {
  if (rarity === 'common') return 1;
  if (night && bait.nightMult && bait.nightMult[rarity] != null) return bait.nightMult[rarity];
  return bait.mult[rarity] ?? 1;
}

/**
 * Bảng tỉ lệ gặp cá: nhóm độ hiếm × hệ số mồi (× thưởng quăng xa với nhóm hiếm), chuẩn hóa về 100%.
 * Loài không đủ điều kiện bị loại, phần tỉ lệ của nó chia lại cho các loài cùng nhóm.
 */
export function encounterTable(ctx) {
  const region = regionById(ctx.region);
  const spot = region.spots.find(sp => sp.id === ctx.spot);
  const bait = BAIT_BY_ID[ctx.bait] || BAIT_BY_ID.worm;
  const list = [];
  for (const r of RARITY_ORDER) {
    const eligible = FISH.filter(f => f.region === ctx.region && f.rarity === r && isConditionMet(f.condition, ctx));
    if (!eligible.length) continue;
    let gw = BALANCE.rarities[r].groupPct * baitMult(bait, r, ctx.night);
    if (r !== 'common') gw *= 1 + BALANCE.cast.depthRareBonus * (ctx.power || 0);
    const ws = eligible.map(f => (spot && spot.favor.includes(f.id) ? BALANCE.spotFavorWeight : 1));
    const sum = ws.reduce((a, b) => a + b, 0);
    eligible.forEach((f, i) => list.push({ fish: f, weight: (gw * ws[i]) / sum }));
  }
  const total = list.reduce((a, x) => a + x.weight, 0);
  for (const x of list) x.pct = (x.weight / total) * 100;
  return list;
}

export const rollFish = ctx => weightedPick(encounterTable(ctx), x => x.weight).fish;

export function rollSize() {
  const sizes = BALANCE.sizes.map((s, i) => ({ ...s, i }));
  return weightedPick(sizes, s => s.chance).i;
}

export function rollLength(fish, sizeIdx) {
  const base = 10 + fish.difficulty * 9 + rarityIndex(fish.rarity) * 14;
  return Math.round(base * BALANCE.sizes[sizeIdx].scale * rand(0.9, 1.1));
}

export function catchValue(fish, sizeIdx, perfect) {
  return Math.round(fish.price * BALANCE.sizes[sizeIdx].mult * (perfect ? 1 + BALANCE.bite.perfectBonus : 1));
}

/** Cần có Lực ≥ Độ khó − 2 mới có cơ hội kéo lên. */
export const canHandle = (s, fish) => rodOf(s).power >= fish.difficulty - BALANCE.reel.margin;

// ---------- Bán cá & chống lạm phát ----------
export function fatigueCount(s, id) {
  const f = s.fatigue[id];
  if (!f) return 0;
  if (s.gameTime >= f.reset) {
    delete s.fatigue[id];
    return 0;
  }
  return f.n;
}
export const fatigueMult = n => Math.max(1 - BALANCE.fatigue.max, 1 - BALANCE.fatigue.step * n);

function saleOrder(items) {
  return [...items].sort((a, b) => (a.id === b.id ? b.value - a.value : a.id < b.id ? -1 : 1));
}

/** Tổng tiền nếu bán các con cá này (cùng loài bán liên tục giảm 5%/con, tối đa −30%). */
export function previewSale(s, items) {
  const counts = {};
  let total = 0;
  for (const it of saleOrder(items)) {
    const n = counts[it.id] ?? fatigueCount(s, it.id);
    total += Math.round(it.value * fatigueMult(n));
    counts[it.id] = n + 1;
  }
  return total;
}

export function sellItems(s, items) {
  let total = 0;
  for (const it of saleOrder(items)) {
    const n = fatigueCount(s, it.id);
    total += Math.round(it.value * fatigueMult(n));
    const f = s.fatigue[it.id] || (s.fatigue[it.id] = { n: 0, reset: s.gameTime + 1440 * BALANCE.fatigue.resetDays });
    f.n = n + 1;
  }
  const set = new Set(items);
  s.inventory = s.inventory.filter(it => !set.has(it));
  s.coins += total;
  s.stats.earned += total;
  return total;
}

// ---------- Fishdex ----------
export function recordDex(s, fish, sizeIdx, length) {
  const e = s.dex[fish.id] || (s.dex[fish.id] = { n: 0, sizes: [0, 0, 0, 0], best: 0 });
  const isNew = e.n === 0;
  const newSize = !e.sizes[sizeIdx];
  e.n++;
  e.sizes[sizeIdx]++;
  const record = length > e.best;
  e.best = Math.max(e.best, length);
  return { isNew, newSize, record: record && !isNew };
}
export const dexCount = s => Object.keys(s.dex).length;
export const regionDexCount = (s, r) => FISH.filter(f => f.region === r && s.dex[f.id]).length;
export const legendCount = s => FISH.filter(f => f.rarity === 'legendary' && s.dex[f.id]).length;

export function checkMilestones(s) {
  const every = BALANCE.rewards.milestoneEvery;
  const reached = Math.floor(dexCount(s) / every);
  const out = [];
  while (s.milestones < reached) {
    s.milestones++;
    const n = s.milestones * every;
    const reg = regionById(Math.min(5, Math.ceil(n / 20)));
    const coins = niceRound(reg.avgCoin * BALANCE.rewards.milestoneFishCount);
    s.coins += coins;
    out.push({ n, coins });
  }
  return out;
}

export function nextMilestone(s) {
  const every = BALANCE.rewards.milestoneEvery;
  const n = (s.milestones + 1) * every;
  if (n > FISH.length) return null;
  const reg = regionById(Math.min(5, Math.ceil(n / 20)));
  return { n, coins: niceRound(reg.avgCoin * BALANCE.rewards.milestoneFishCount) };
}

// ---------- Skin thuyền ----------
export function skinUnlocked(s, skin) {
  const q = skin.req;
  if (!q) return true;
  if (q.type === 'regionSpecies') return regionDexCount(s, q.region) >= q.count;
  if (q.type === 'legendaries') return legendCount(s) >= q.count;
  return false;
}
export function checkSkins(s) {
  const out = [];
  for (const sk of SKINS) {
    if (!s.skins.includes(sk.id) && skinUnlocked(s, sk)) {
      s.skins.push(sk.id);
      out.push(sk);
    }
  }
  return out;
}

// ---------- Thuyền ----------
export function boatRequirement(s, boat) {
  const prev = boat.region - 1;
  const need = BALANCE.boatSpeciesRequirement;
  if (prev < 1) return { ok: true, have: 0, need: 0, region: null };
  const have = regionDexCount(s, prev);
  return { ok: have >= need, have, need, region: regionById(prev) };
}

export function travelTime(s, from, to) {
  const legs = Math.abs(to - from);
  const t = bestBoat(s).legTime || 20;
  return t * (1 + BALANCE.travel.extraLegFactor * (legs - 1));
}

// ---------- Mồi ----------
export const baitPrice = (bait, regionId) =>
  bait.type === 'consumable' ? bait.price * regionById(regionId).baitPriceMult : bait.price;

export function baitCount(s, id) {
  const b = BAIT_BY_ID[id];
  if (!b) return 0;
  if (b.type === 'infinite') return Infinity;
  if (b.type === 'permanent') return s.lure ? Infinity : 0;
  return s.baits[id] || 0;
}

// ---------- Nhiệm vụ hằng ngày ----------
export function highestRegion(s) {
  return maxRegionReachable(s);
}

export function ensureQuests(s) {
  const key = todayKey();
  if (s.quests && s.quests.date === key) return false;
  const rng = mulberry32(hashStr(key));
  const pool = [...QUESTS];
  const avg = regionById(highestRegion(s)).avgCoin;
  const list = [];
  while (list.length < 3 && pool.length) {
    const q = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const n = q.type === 'sell'
      ? niceRound(avg * q.fishValue[Math.floor(rng() * q.fishValue.length)])
      : q.n[Math.floor(rng() * q.n.length)];
    list.push({
      id: q.id, type: q.type, n, p: 0, claimed: false,
      text: q.text.replace('{n}', fmt(n)),
      rarity: q.rarity || null, size: q.size ?? null,
      reward: niceRound(avg * BALANCE.rewards.questFishCount),
    });
  }
  s.quests = { date: key, list };
  return true;
}

/** ev: {type:'catch', fish, size, perfect, night} | {type:'sell', value} → trả về nhiệm vụ vừa hoàn thành. */
export function questEvent(s, ev) {
  const done = [];
  for (const q of s.quests?.list ?? []) {
    if (q.p >= q.n) continue;
    let inc = 0;
    const c = ev.type === 'catch';
    switch (q.type) {
      case 'catch': inc = c ? 1 : 0; break;
      case 'minRarity': inc = c && rarityIndex(ev.fish.rarity) >= rarityIndex(q.rarity) ? 1 : 0; break;
      case 'perfect': inc = c && ev.perfect ? 1 : 0; break;
      case 'minSize': inc = c && ev.size >= q.size ? 1 : 0; break;
      case 'night': inc = c && ev.night ? 1 : 0; break;
      case 'sell': inc = ev.type === 'sell' ? ev.value : 0; break;
    }
    if (inc) {
      q.p = Math.min(q.n, q.p + inc);
      if (q.p >= q.n) done.push(q);
    }
  }
  return done;
}

export function claimQuest(s, q) {
  if (q.claimed || q.p < q.n) return 0;
  q.claimed = true;
  s.coins += q.reward;
  return q.reward;
}
