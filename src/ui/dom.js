/** Tạo phần tử DOM gọn: h('div.a.b#id', {onclick, style}, ...children) */
export function h(tag, props, ...children) {
  const parts = tag.split(/(?=[.#])/);
  const el = document.createElement(parts[0] && !/^[.#]/.test(parts[0]) ? parts[0] : 'div');
  for (const p of parts) {
    if (p[0] === '.') el.classList.add(p.slice(1));
    else if (p[0] === '#') el.id = p.slice(1);
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += ' ' + v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(svg, cls = '') {
  const s = document.createElement('span');
  s.className = 'ic ' + cls;
  s.innerHTML = svg;
  return s;
}

const S = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const CLOUD = '<path d="M7 16.5a4 4 0 01-.6-7.96A5.5 5.5 0 0117.1 9.9 3.3 3.3 0 0117 16.5z"';

export const I = {
  coin: S('<circle cx="12" cy="12" r="9.5" fill="#f6c343" stroke="#c98f12" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#d9a21c" stroke-width="1.6"/><path d="M12 9v6" stroke="#b07a0e" stroke-width="2" stroke-linecap="round"/>'),
  book: S('<path d="M3 5.5C5.5 4 8.5 4 11 5.5V20c-2.5-1.5-5.5-1.5-8 0z M21 5.5C18.5 4 15.5 4 13 5.5V20c2.5-1.5 5.5-1.5 8 0z" fill="currentColor"/>'),
  bag: S('<path d="M5 8.5h14l-1.2 11.5H6.2z" fill="currentColor"/><path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="currentColor" stroke-width="2" fill="none"/>'),
  anchor: S('<circle cx="12" cy="5" r="2.2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7.2V21M8 11h8M4.5 14a7.5 7.5 0 0015 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>'),
  map: S('<path d="M3 6.5l6-2 6 2 6-2v13l-6 2-6-2-6 2z" fill="currentColor"/><path d="M9 4.5v13M15 6.5v13" stroke="#fff" stroke-width="1.4" opacity=".55"/>'),
  sun: S('<circle cx="12" cy="12" r="4.6" fill="#ffc83a"/><g stroke="#ffc83a" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/></g>'),
  moon: S('<path d="M19.5 14.6A8 8 0 019.4 4.5a8 8 0 1010.1 10.1z" fill="#ffe08a"/>'),
  rain: S(`${CLOUD} fill="#dfe6ee"/><path d="M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5" stroke="#5aa9ff" stroke-width="2" stroke-linecap="round"/>`),
  storm: S(`${CLOUD} fill="#9aa6b4"/><path d="M12.5 14.5l-2.5 4h3l-1.5 4 4.5-6h-3l1.5-2z" fill="#ffd23a"/>`),
  snow: S(`${CLOUD} fill="#eef3f8"/><g fill="#9ad8ff"><circle cx="8" cy="19.5" r="1.2"/><circle cx="12" cy="21" r="1.2"/><circle cx="16" cy="19.5" r="1.2"/></g>`),
  clock: S('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" stroke-width="2.2" fill="none"/>'),
  star: S('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z" fill="currentColor"/>'),
  fish: S('<path d="M2.5 12c3-4.8 9-5.8 13-2.8L20.5 6l-1.3 6 1.3 6-5-3.2c-4 3-10 2-13-2.8z" fill="currentColor"/><circle cx="7.5" cy="11" r="1.2" fill="#fff"/>'),
  rod: S('<path d="M4 20L19.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19.5 4.5v10" stroke="currentColor" stroke-width="1"/><circle cx="19.5" cy="16" r="1.8" fill="#ff5a4a"/><circle cx="7.5" cy="16.5" r="2.4" fill="currentColor"/>'),
  boat: S('<path d="M2.5 14.5h19l-3.2 5H5.7z" fill="currentColor"/><path d="M12 3v10.5M12.6 4l6.4 8.5h-6.4z" stroke="currentColor" stroke-width="1.4" fill="currentColor"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: S('<path d="M10 5L3.5 11.5 10 18M4 11.5h10.5a5.5 5.5 0 010 11" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  worm: S('<path d="M4 16c0-4 5-4 5-8s6-4 6 0-1 8 5 8" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round"/>'),
  chest: S('<rect x="3" y="9" width="18" height="11" rx="1.5" fill="#b8763a"/><path d="M3 9.5a9 4.5 0 0118 0z" fill="#d08a44"/><rect x="10.5" y="11" width="3" height="4" rx=".6" fill="#ffd23a"/>'),
  gift: S('<rect x="3.5" y="9" width="17" height="11" rx="1.5" fill="currentColor"/><rect x="2.5" y="6.5" width="19" height="4" rx="1" fill="currentColor"/><path d="M12 6.5V20" stroke="#fff" stroke-width="2"/><path d="M12 6.5C10 3 6.5 3.5 7.5 6.5M12 6.5c2-3.5 5.5-3 4.5 0" stroke="currentColor" stroke-width="1.8" fill="none"/>'),
  play: S('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
  pin: S('<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" fill="currentColor"/><circle cx="12" cy="10" r="2.4" fill="#fff"/>'),
  sound: S('<path d="M4 9.5h4l5-4v13l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};
