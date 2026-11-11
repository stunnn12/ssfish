// Chu kỳ ngày/đêm (1 ngày trong game = 12 phút thật) và thời tiết ngẫu nhiên.
import { BALANCE } from './data.js';
import { rand, weightedPick } from './util.js';

const MIN_PER_SEC = 1440 / BALANCE.clock.realSecondsPerDay;

export function tickClock(s, dt) {
  s.gameTime += dt * MIN_PER_SEC;
  if (s.gameTime >= s.weather.until) rollWeather(s);
}

export function rollWeather(s, kind) {
  const w = BALANCE.weather;
  const k = kind || weightedPick(['sun', 'rain', 'storm'], x => w[x]);
  s.weather = { kind: k, until: s.gameTime + rand(w.minHours, w.maxHours) * 60 };
}

export const hourOf = s => (s.gameTime / 60) % 24;
export const dayOf = s => Math.floor(s.gameTime / 1440);

export function isNight(s) {
  const h = hourOf(s);
  return h >= BALANCE.clock.nightStart || h < BALANCE.clock.nightEnd;
}

export function clockText(s) {
  const m = Math.floor(s.gameTime % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function weatherName(kind, precip) {
  if (kind === 'sun') return 'Nắng';
  if (kind === 'storm') return precip === 'snow' ? 'Bão tuyết' : 'Bão';
  return precip === 'snow' ? 'Tuyết' : precip === 'ash' ? 'Mưa tro' : 'Mưa';
}
