// Kiểm tra dữ liệu game: đủ 100 loài, cơ cấu độ hiếm mỗi vùng, giá khớp công thức.
// Chạy: npm run check-data
import { readFileSync } from 'node:fs';

const load = p => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'));
const fish = load('fish.json');
const regions = load('regions.json');
const balance = load('balance.json');
const baits = load('baits.json');

let errors = 0;
const err = m => { errors++; console.error('  ✗ ' + m); };

console.log(`Số loài: ${fish.length}`);
if (fish.length !== 100) err('Cần đúng 100 loài');
const ids = new Set(fish.map(f => f.id));
if (ids.size !== fish.length) err('Trùng id');

const expectCount = { common: 8, uncommon: 6, rare: 4, epic: 1, legendary: 1 };
for (const r of regions) {
  const list = fish.filter(f => f.region === r.id);
  const counts = {};
  for (const f of list) counts[f.rarity] = (counts[f.rarity] || 0) + 1;
  for (const [k, n] of Object.entries(expectCount)) if (counts[k] !== n) err(`Vùng ${r.id}: ${k} có ${counts[k] || 0}, cần ${n}`);
  const totalPct = list.reduce((a, f) => a + f.chancePct, 0);
  if (Math.abs(totalPct - 100) > 0.01) err(`Vùng ${r.id}: tổng tỉ lệ ${totalPct}`);
  for (const s of r.spots) for (const id of s.favor) if (!list.find(f => f.id === id)) err(`Điểm câu ${s.id} trỏ tới cá ngoài vùng: ${id}`);
  const cond = list.filter(f => f.condition !== 'any').length;
  console.log(`Vùng ${r.id} ${r.name}: ${list.length} loài, ${cond} loài có điều kiện, giá ${Math.min(...list.map(f => f.price))}–${Math.max(...list.map(f => f.price))}`);
}

// Giá = G_vùng × H_hiếm × (1 + 0,15 × Độ khó) (cỡ Vừa). Bảng phụ lục làm tròn, cho phép lệch ≤ 8%.
for (const f of fish) {
  const r = regions.find(x => x.id === f.region);
  const formula = r.basePrice * balance.rarities[f.rarity].priceMult * (1 + balance.difficultyPriceStep * f.difficulty);
  const dev = Math.abs(f.price - formula) / formula;
  if (dev > 0.08) err(`${f.id} ${f.name}: giá ${f.price} lệch công thức ${formula.toFixed(1)} (${(dev * 100).toFixed(1)}%)`);
  const [lo, hi] = r.difficulty;
  if (f.difficulty < lo || f.difficulty > hi) err(`${f.id}: độ khó ${f.difficulty} ngoài khoảng vùng ${lo}–${hi}`);
}

// Giá trị kỳ vọng mỗi con (mồi thường, đủ điều kiện, có tính cỡ cá)
const sizeAvg = balance.sizes.reduce((a, s) => a + s.chance / 100 * s.mult, 0);
for (const r of regions) {
  const list = fish.filter(f => f.region === r.id);
  const ev = list.reduce((a, f) => a + f.chancePct / 100 * f.price, 0) * sizeAvg;
  console.log(`Vùng ${r.id}: giá trị kỳ vọng ~${ev.toFixed(0)} xu/con (thiết kế ~${r.avgCoin})`);
}
console.log(`Mồi: ${baits.map(b => b.name).join(', ')}`);
console.log(errors ? `\n${errors} lỗi` : '\nDữ liệu hợp lệ ✓');
process.exit(errors ? 1 : 0);
