// Mô phỏng pha kéo cá bằng đúng code của game (src/reel.js) để chỉnh cân bằng trong balance.json.
// Chạy: npm run reel-sim
import { readFileSync } from 'node:fs';
import { createReel, stepReel } from '../src/reel.js';

const load = p => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'));
const R = load('balance.json').reel;
const RODS = load('rods.json');

/** Người chơi ảo: 'good' nhả khi thấy báo hiệu !!, 'novice' chỉ nhả khi cá đã vùng vẫy, 'hold' không bao giờ nhả. */
function play(d, rodLevel, { policy, reaction, legendary = false, size = 1, castPower = 0.6 }) {
  const r = createReel({ difficulty: d, legendary, size, rod: RODS[rodLevel - 1], castPower }, R);
  const dt = 1 / 60;
  let holding = true, want = true, decideAt = 0, t = 0;
  while (t < 180) {
    t += dt;
    const thrash = r.thrashLeft > 0;
    const desire = policy === 'hold' ? true : policy === 'good' ? !(thrash || r.warned) && r.T < 0.8 : !thrash && r.T < 0.84;
    if (desire !== want) { want = desire; decideAt = t + reaction; }
    if (t >= decideAt) holding = want;
    const ev = stepReel(r, R, dt, holding);
    if (ev === 'landed') return { ok: true, t };
    if (ev === 'snap' || ev === 'escape') return { ok: false, why: ev, t };
  }
  return { ok: false, why: 'timeout', t };
}

function row(d, rod, opt) {
  const N = 400;
  let ok = 0, time = 0, snap = 0, esc = 0;
  for (let i = 0; i < N; i++) {
    const r = play(d, rod, opt);
    if (r.ok) { ok++; time += r.t; } else if (r.why === 'snap') snap++; else esc++;
  }
  const pct = n => `${Math.round((n / N) * 100)}%`.padStart(4);
  return `thắng ${pct(ok)}  ~${ok ? (time / ok).toFixed(0).padStart(2) : ' -'}s  đứt ${pct(snap)}  sổng ${pct(esc)}`;
}

const cases = [
  [1, 1, 'vùng 1, cá dễ'], [2, 1, 'e=3'], [3, 1, 'e=4 (giới hạn)'], [4, 1, 'quá sức → phải đứt'],
  [3, 3, 'e=2'], [5, 3, 'e=4'], [7, 5, 'e=4'], [9, 7, 'boss e=4', true], [10, 8, 'boss e=4', true], [10, 10, 'boss, cần max', true],
];
const players = [
  ['good', 0.2, 'Người chơi khá (phản xạ 0,2s, nhả khi thấy !!)'],
  ['novice', 0.35, 'Người mới (phản xạ 0,35s, nhả khi cá đã vùng vẫy)'],
  ['novice', 0.5, 'Phản xạ chậm (0,5s)'],
  ['hold', 0, 'Giữ liên tục, không bao giờ nhả'],
];
for (const [policy, reaction, label] of players) {
  console.log(`\n== ${label} ==`);
  for (const [d, rod, note, legendary] of cases) {
    console.log(`độ khó ${String(d).padStart(2)} · cần ${String(rod).padStart(2)}  ${row(d, rod, { policy, reaction, legendary })}  ${note}`);
  }
}
