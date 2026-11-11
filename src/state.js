// Trạng thái lưu game. Lưu qua Playables SDK (saveData/loadData) hoặc localStorage khi chơi ngoài Playables.
import { BALANCE, REGIONS } from './data.js';

export const SAVE_VERSION = 1;

export function newState() {
  const start = BALANCE.clock.startHour * 60;
  return {
    v: SAVE_VERSION,
    coins: 0,
    rodLevel: 1,
    storageLevel: 1,
    boats: ['rowboat'],
    skin: 'default',
    skins: ['default'],
    region: 1,
    spot: REGIONS[0].spots[0].id,
    atPort: false,
    bait: 'worm',
    baits: { shrimp: 0, glow: 0, gold: 0, legend: 0 },
    lure: false,
    inventory: [],
    dex: {},
    fatigue: {},
    gameTime: start,
    weather: { kind: 'sun', until: start + 180 },
    quests: null,
    milestones: 0,
    buffs: { school: 0 },
    stats: { caught: 0, perfect: 0, earned: 0, casts: 0, lost: 0 },
    tut: 0,
    created: Date.now(),
  };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined || target[k] === null && v !== null) target[k] = v;
    else if (isObj(v) && isObj(target[k]) && k !== 'dex' && k !== 'fatigue') fillDefaults(target[k], v);
  }
  return target;
}

/** Chuẩn hóa dữ liệu đã lưu; trả về null nếu không dùng được. */
export function migrate(saved) {
  if (!isObj(saved) || saved.v !== SAVE_VERSION) return null;
  const s = fillDefaults(saved, newState());
  if (!REGIONS.find(r => r.id === s.region)) s.region = 1;
  const reg = REGIONS.find(r => r.id === s.region);
  if (!reg.spots.find(sp => sp.id === s.spot)) s.spot = reg.spots[0].id;
  s.inventory = Array.isArray(s.inventory) ? s.inventory.filter(it => it && it.id) : [];
  return s;
}
