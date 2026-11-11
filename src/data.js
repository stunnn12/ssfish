// Toàn bộ nội dung game nằm trong JSON; code chỉ đọc dữ liệu.
import FISH from './data/fish.json';
import REGIONS from './data/regions.json';
import BAITS from './data/baits.json';
import RODS from './data/rods.json';
import STORAGE from './data/storage.json';
import BOATDATA from './data/boats.json';
import QUESTS from './data/quests.json';
import BALANCE from './data/balance.json';

export { FISH, REGIONS, BAITS, RODS, STORAGE, QUESTS, BALANCE };
export const BOATS = BOATDATA.boats;
export const SKINS = BOATDATA.skins;

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));
export const BAIT_BY_ID = Object.fromEntries(BAITS.map(b => [b.id, b]));
export const BOAT_BY_ID = Object.fromEntries(BOATS.map(b => [b.id, b]));
export const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

export const regionById = id => REGIONS.find(r => r.id === id);
export const rarityInfo = r => BALANCE.rarities[r];
export const rarityIndex = r => RARITY_ORDER.indexOf(r);
export const fishOfRegion = id => FISH.filter(f => f.region === id);
export const MAX_REGION = Math.min(BALANCE.releasedRegions, REGIONS.length);

export const CONDITION_TEXT = {
  any: 'Mọi lúc',
  night: 'Chỉ ban đêm',
  rain: 'Chỉ khi mưa',
  storm: 'Chỉ khi có bão',
};
