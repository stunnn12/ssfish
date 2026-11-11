export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

export function weightedPick(items, getW, rng = Math.random) {
  let total = 0;
  for (const it of items) total += getW(it);
  let r = rng() * total;
  for (const it of items) {
    r -= getW(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fmt(n) {
  n = Math.round(n);
  try {
    return n.toLocaleString('vi-VN');
  } catch {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
}

/** Làm tròn "đẹp" 2 chữ số có nghĩa: 2345 → 2300, 47 → 45. */
export function niceRound(n) {
  if (n < 50) return Math.max(5, Math.round(n / 5) * 5);
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
