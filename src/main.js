import './style.css';
import { game } from './game.js';
import { sdk } from './sdk.js';
import { audio } from './audio.js';
import { newState, migrate } from './state.js';
import { regionById } from './data.js';
import { ensureQuests } from './logic.js';
import { tickClock, hourOf } from './world.js';
import { Stage } from './scene/stage.js';
import { Fishing } from './fishing.js';
import { UI } from './ui/ui.js';
import { rand } from './util.js';

const canvas = document.getElementById('game');
let last = performance.now();
let raf = 0;

function env() {
  const s = game.state;
  return { hour: hourOf(s), weather: game.travel?.storm ? 'storm' : s.weather.kind };
}

function frame(now) {
  raf = 0;
  if (game.paused) return;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const s = game.state;
  if (game.mode !== 'title') tickClock(s, dt);
  game.fishing.update(dt);
  if (game.mode === 'travel') game.updateTravel(dt);
  game.stage.update(dt, env());
  game.ui.hud.update(dt);
  game.stage.render();
  audio.setAmbience(s.weather.kind === 'storm' ? 1 : s.weather.kind === 'rain' ? 0.6 : 0.3);
  raf = requestAnimationFrame(frame);
}

function startLoop() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// Playables: dừng hẳn game khi bị tạm dừng (ẩn tab, cuộn đi, quảng cáo...).
function pause() {
  if (game.paused) return;
  game.paused = true;
  game.input.down = false;
  audio.setPaused(true);
  game.saveNow();
}
function resume() {
  if (!game.paused) return;
  game.paused = false;
  audio.setPaused(false);
  startLoop();
}

function setupInput() {
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button > 0) return;
    audio.unlock();
    game.input.down = true;
    game.press();
  });
  const up = () => {
    if (!game.input.down) return;
    game.input.down = false;
    game.releasePress();
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (e.repeat || game.input.down) return;
    audio.unlock();
    game.input.down = true;
    game.press();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'Enter') up();
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  document.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => game.stage.resize());
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
}

async function boot() {
  // 1) Vẽ khung hình đầu tiên càng sớm càng tốt.
  const stage = new Stage(canvas);
  game.stage = stage;
  game.state = newState();
  stage.setRegion(regionById(1));
  stage.setBoat('rowboat');
  stage.placeAtSpot(regionById(1).spots[0]);
  stage.update(0.016, env());
  stage.render();
  sdk.firstFrameReady();

  // 2) Nạp dữ liệu đã lưu (cloud save trên Playables, localStorage khi chơi ngoài).
  const saved = await sdk.loadData();
  const s = migrate(saved) || newState();
  game.state = s;
  ensureQuests(s);

  game.fishing = new Fishing(game);
  game.ui = new UI(game);
  if (s.region !== 1) stage.setRegion(regionById(s.region));
  game.applyVisuals();
  const region = regionById(s.region);
  const spot = region.spots.find(sp => sp.id === s.spot) || region.spots[0];
  stage.placeAtSpot(spot);
  game.fishing.reset();
  game.mode = 'title';
  game.ui.hud.setMode('title');

  stage.onThunder = () => setTimeout(() => audio.play('thunder'), rand(250, 1300));
  audio.setEnabled(sdk.isAudioEnabled());
  sdk.onAudioEnabledChange(v => audio.setEnabled(v));
  sdk.onPause(pause);
  sdk.onResume(resume);
  setupInput();
  startLoop();

  game.ui.showTitle(() => {
    audio.unlock();
    if (s.atPort) game.enterPort();
    else game.enterSpot(spot.id);
  });
  // 3) Người chơi đã có thể tương tác.
  sdk.gameReady();
  if (import.meta.env.DEV) window.__game = game; // chỉ để kiểm thử khi chạy dev
}

boot().catch(err => {
  console.error(err);
  sdk.logError(String(err && err.message ? err.message : err));
});
