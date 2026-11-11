// Lớp bọc YouTube Playables SDK (ytgame). Ngoài môi trường Playables thì dùng localStorage
// để chơi thử trên trình duyệt thường.
const LS_KEY = 'tinytides.save.v1';

const yt = () => (typeof window !== 'undefined' ? window.ytgame : undefined);

function inPlayables() {
  try {
    return !!(yt() && yt().IN_PLAYABLES_ENV);
  } catch {
    return false;
  }
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    console.warn('[sdk]', e);
    return fallback;
  }
}

export const sdk = {
  get inPlayables() {
    return inPlayables();
  },

  /** Gọi ngay khi khung hình đầu tiên đã vẽ lên màn hình. */
  firstFrameReady() {
    if (inPlayables()) safe(() => yt().game.firstFrameReady());
  },

  /** Gọi khi người chơi đã có thể tương tác. */
  gameReady() {
    if (inPlayables()) safe(() => yt().game.gameReady());
  },

  async loadData() {
    if (inPlayables()) {
      try {
        const s = await yt().game.loadData();
        return s ? JSON.parse(s) : null;
      } catch (e) {
        this.logWarning('loadData failed');
        console.warn(e);
        return null;
      }
    }
    try {
      const s = localStorage.getItem(LS_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  },

  async saveData(obj) {
    const s = JSON.stringify(obj);
    if (inPlayables()) {
      try {
        await yt().game.saveData(s);
      } catch (e) {
        console.warn('[sdk] saveData', e);
      }
      return;
    }
    try {
      localStorage.setItem(LS_KEY, s);
    } catch {
      /* bộ nhớ bị chặn: bỏ qua */
    }
  },

  onPause(cb) {
    if (inPlayables()) safe(() => yt().system.onPause(cb));
  },
  onResume(cb) {
    if (inPlayables()) safe(() => yt().system.onResume(cb));
  },

  isAudioEnabled() {
    if (inPlayables()) return safe(() => yt().system.isAudioEnabled(), true);
    return true;
  },
  onAudioEnabledChange(cb) {
    if (inPlayables()) safe(() => yt().system.onAudioEnabledChange(cb));
  },

  sendScore(value) {
    if (inPlayables()) safe(() => yt().engagement.sendScore({ value: Math.floor(value) }));
  },

  logWarning(msg) {
    if (inPlayables()) safe(() => yt().health.logWarning(msg));
  },
  logError(msg) {
    if (inPlayables()) safe(() => yt().health.logError(msg));
  },
};
