'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const STORE = 'kban-board-layout';
  const SNAP = 12;
  const MIN_W = 240;
  const MIN_H = 170;
  const CANVAS_BOUND = 5000;

  const ITEMS = [
    { id: 'movies',  icon: '🎬', title: 'Вечер',    def: { w: 310, h: 380 } },
    { id: 'news',    icon: '🗞', title: 'Новости',  def: { w: 330, h: 400 } },
    { id: 'music',   icon: '🎵', title: 'Музыка',   def: { w: 310, h: 340 } },
    { id: 'notif',   icon: '🔔', title: 'Уведомл.', def: { w: 300, h: 330 } },
    { id: 'gh',      icon: '⭐', title: 'GitHub',   def: { w: 330, h: 380 } },
    { id: 'console', icon: '🖥', title: 'Консоль',  def: { w: 350, h: 320 } },
    { id: 'ops',     icon: '📡', title: 'Трансляция', def: { w: 340, h: 240 } },
    { id: 'stats',   icon: '📊', title: 'Сервер',   def: { w: 300, h: 300 } },
    { id: 'yt',      icon: '▶', title: 'YouTube',   def: { w: 360, h: 380 } },
    { id: 'interests', icon: '🧠', title: 'Интересы', def: { w: 340, h: 400 } },
    { id: 'games',   icon: '🎮', title: 'Игры',     def: { w: 420, h: 480 } },
    { id: 'msgs',    icon: '🗨', title: 'Сообщения', def: { w: 380, h: 420 } },
    { id: 'smart',   icon: '🏠', title: 'Умный дом', def: { w: 360, h: 460 } }
  ];

  let layout = {};
  let zTop = 10;
  let active = false;

  function panelOf(id) {
    if (id === 'gh' || id === 'console') return 'sys-panel';
    if (id === 'ops') return 'ops-panel';
    if (id === 'stats') return 'stats-panel';
    if (id === 'yt') return 'yt-panel';
    if (id === 'interests') return 'interests-panel';
    if (id === 'games') return 'games-panel';
    if (id === 'msgs') return 'msgs-panel';
    if (id === 'smart') return 'smart-panel';
    return 'side-widget';
  }
  function itemOf(id) { return ITEMS.find(i => i.id === id); }
  function homeOf(id) {
    if (id === 'gh') return 'sp-gh';
    if (id === 'console') return 'sp-console';
    if (id === 'ops') return 'sp-ops';
    if (id === 'stats') return 'sp-stats';
    if (id === 'yt') return 'sp-yt';
    if (id === 'interests') return 'sp-interests';
    if (id === 'games') return 'sp-games';
    if (id === 'msgs') return 'sp-msgs';
    if (id === 'smart') return 'sp-smart';
    return 'sw-' + id;
  }
  function loaderOf(id) {
    if (id === 'news') return () => window.NEWSBTN && window.NEWSBTN.load();
    if (id === 'gh') return () => window.GHBTN && window.GHBTN.load();
    if (id === 'console') return () => window.CONS && window.CONS.load();
    if (id === 'music') return () => window.MUSIC && window.MUSIC.load();
    if (id === 'notif') return () => window.NOTIFY && window.NOTIFY.loadHistory();
    if (id === 'ops') return () => window.OPS && window.OPS.load();
    if (id === 'stats') return () => window.STATS && window.STATS.load();
    if (id === 'yt') return () => window.YT && window.YT.load();
    if (id === 'interests') return () => window.INT && window.INT.load();
    if (id === 'games') return () => window.GAMES && window.GAMES.load();
    if (id === 'msgs') return () => window.MSGS && window.MSGS.load();
    if (id === 'smart') return () => window.SMART && window.SMART.load();
    return () => window.MOVIES && window.MOVIES.load();
  }
  const snap = v => Math.round(v / SNAP) * SNAP;

  function collides(x, y, w, h, id) {
    for (const k in layout) {
      if (k === id) continue;
      const t = layout[k];
      if (x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y) return true;
    }
    return false;
  }

  function freeSlot(x, y, w, h, id) {
    if (!collides(x, y, w, h, id)) return { x, y };
    const maxR = CANVAS_BOUND;
    for (let r = SNAP; r <= maxR; r += SNAP) {
      for (let dx = -r; dx <= r; dx += SNAP) {
        for (let dy = -r; dy <= r; dy += SNAP) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = snap(x + dx), ny = snap(y + dy);
          if (nx < -CANVAS_BOUND || ny < 0 || nx + w > CANVAS_BOUND || ny + h > CANVAS_BOUND) continue;
          if (!collides(nx, ny, w, h, id)) return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  }

  function visibleRect() {
    const C = window.CANVAS;
    const v = (C && C.visible) ? C.visible() : { left: 12, top: 72, width: 2000, height: 1200 };
    const minTop = (C && C.safeTop) ? C.safeTop() : 0;
    return {
      left: Math.max(0, v.left || 12),
      top: Math.max(v.top || 72, minTop),
      width: Math.max(400, v.width || 2000),
      height: Math.max(400, v.height || 1200)
    };
  }

  /* Свободное место В видимой области доски: столбцы сверху вниз, слева направо,
     никогда не уводя панель за нижний/правый край видимой части. */
  function flowScan(id, w, h) {
    const v = visibleRect();
    const maxRight = Math.min(Math.max(400, safeRightX()), CANVAS_BOUND - w);
    const x0 = snap(v.left + 24);
    const y0 = snap(v.top + 10);
    let guard = 0;
    for (let col = 0; col < 36 && guard < 900; col++) {
      const cx = snap(x0 + col * (w + 16));
      if (cx + w > maxRight) break;
      for (let row = 0; guard < 900; row++) {
        const cy = snap(y0 + row * (h + 10));
        if (cy + h > v.top + v.height) break;
        if (!collides(cx, cy, w, h, id)) return { x: cx, y: cy };
        guard++;
      }
      guard++;
    }
    const f0 = freeSlot(x0, y0, w, h, id);
    return { x: f0.x, y: f0.y };
  }

  function mutualSnap(x, y, w, h, id) {
    const SENS = 24;
    let bx = null, by = null, dxBest = SENS, dyBest = SENS;
    for (const k in layout) {
      if (k === id) continue;
      const t = layout[k];
      const candX = [
        [Math.abs(x - t.x), t.x],
        [Math.abs(x - (t.x + t.w)), t.x + t.w],
        [Math.abs((x + w) - t.x), t.x - w],
        [Math.abs((x + w) - (t.x + t.w)), t.x + t.w - w],
        [Math.abs((x + w / 2) - (t.x + t.w / 2)), t.x + t.w / 2 - w / 2]
      ];
      for (const [d, v] of candX) if (d < dxBest) { dxBest = d; bx = v; }
      const candY = [
        [Math.abs(y - t.y), t.y],
        [Math.abs(y - (t.y + t.h)), t.y + t.h],
        [Math.abs((y + h) - t.y), t.y - h],
        [Math.abs((y + h) - (t.y + t.h)), t.y + t.h - h],
        [Math.abs((y + h / 2) - (t.y + t.h / 2)), t.y + t.h / 2 - h / 2]
      ];
      for (const [d, v] of candY) if (d < dyBest) { dyBest = d; by = v; }
    }
    return { x: bx == null ? x : bx, y: by == null ? y : by };
  }

  function heal() {
    document.querySelectorAll('.bp-tile').forEach(t => {
      const id = t.getAttribute('data-tile');
      if (!layout[id] || !t.querySelector('.bp-body > *')) {
        const p = t.querySelector('.bp-body > *');
        const panel = $(panelOf(id));
        if (p && panel) panel.appendChild(p);
        t.remove();
        delete layout[id];
      }
    });
    for (const id in layout) {
      if (!document.querySelector('.bp-tile[data-tile="' + id + '"]') || !$(homeOf(id))) delete layout[id];
    }
  }

  function loadState() {
    try {
      const server = {};
      const A = window.APP && window.APP.db;
      if (A && A.layout && typeof A.layout === 'object') {
        for (const k of Object.keys(A.layout)) {
          const v = A.layout[k];
          if (v && typeof v === 'object') server[k] = v;
        }
      }
      const ls = {};
      try {
        const d = JSON.parse(localStorage.getItem(STORE) || '{}');
        if (d && typeof d === 'object') Object.assign(ls, d);
      } catch (e) {}
      layout = {};
      for (const k of Object.keys(server)) layout[k] = server[k];
      for (const k of Object.keys(ls)) if (layout[k] === undefined) layout[k] = ls[k];
    } catch (e) { layout = {}; }
  }
  function save() {
    try {
      if (active) localStorage.setItem(STORE, JSON.stringify(layout));
      else localStorage.removeItem(STORE);
    } catch (e) {}
    pushServer();
  }
  function pushServer() {
    clearTimeout(pushServer.t);
    pushServer.t = setTimeout(() => {
      try {
        const A = window.APP;
        if (!A || !A.db) return;
        A.db.layout = {};
        for (const k of Object.keys(layout)) A.db.layout[k] = Object.assign({}, layout[k]);
        fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(A.db) }).catch(() => {});
      } catch (e) {}
    }, 300);
  }

  function safeTopY() {
    const C = window.CANVAS;
    if (C && C.safeTop) return C.safeTop();
    return 0;
  }

  function safeRightX() {
    const C = window.CANVAS;
    if (C && C.safeRight) return C.safeRight();
    return CANVAS_BOUND;
  }

  function clamp(id, x, y, w, h) {
    const xMin = -CANVAS_BOUND;
    const xMax = Math.max(xMin, safeRightX() - w);
    x = Math.max(xMin, Math.min(xMax, x));
    y = Math.max(safeTopY(), Math.min(CANVAS_BOUND - h, y));
    return { x, y, w, h };
  }

  function setBoardMode(on) {
    active = on;
    const ov = $('board-panels');
    const sw = $('side-widget');
    if (ov) ov.classList.toggle('open', on);
    if (sw) sw.classList.toggle('hidden', on);
    if (on) { if (window.TILES) try { if (window.TILES.isActive()) window.TILES.toggle(); } catch (e) {} }
    if (!on) {
      restoreSysTabs();
      document.querySelectorAll('.bp-tile').forEach(t => removeTile(t.getAttribute('data-tile'), true));
      const w = window.WIDGET;
      if (w) try { w.tab('movies'); } catch (e) {}
    }
    save();
    syncPanelVisibility();
  }

  function restoreSysTabs() {
    document.querySelectorAll('#sys-panel .st-tab[data-sys="gh"], #sys-panel .st-tab[data-sys="console"]')
      .forEach(t => t.classList.remove('off'));
  }

  function syncPanelVisibility() {
    const opEl = $('ops-panel'), stEl = $('stats-panel'), sysEl = $('sys-panel'), ytEl = $('yt-panel'), intEl = $('interests-panel'), gEl = $('games-panel'), mEl = $('msgs-panel'), smEl = $('smart-panel');
    if (opEl) opEl.classList.toggle('hidden', !!layout.ops);
    if (stEl) stEl.classList.toggle('hidden', !!layout.stats);
    if (sysEl) sysEl.classList.toggle('hidden', !!(layout.gh && layout.console));
    if (ytEl) ytEl.classList.toggle('hidden', !!layout.yt);
    if (intEl) intEl.classList.toggle('hidden', !!layout.interests);
    if (gEl) gEl.classList.toggle('hidden', !!layout.games);
    if (mEl) mEl.classList.toggle('hidden', !!layout.msgs);
    if (smEl) smEl.classList.toggle('hidden', !!layout.smart);
  }

  function sysTabOff(id) {
    const t = document.querySelector('#sys-panel .st-tab[data-sys="' + id + '"]');
    if (t) t.classList.add('off');
  }

  /* ---------- Панель-каталог ---------- */
  function buildPalette() {
    const pl = $('palette');
    if (!pl || pl.dataset.built) return;
    pl.dataset.built = '1';
    pl.innerHTML = `
      <div class="pl-head">
        <h3>🧩 Панели</h3>
        <button class="icon-btn pl-tidy" title="Разложить все окна по сетке">🧹</button>
        <button class="icon-btn pl-close" title="Закрыть каталог">✕</button>
      </div>
      <div class="pl-hint">Перетащите на доску или нажмите — панель встанет и её можно тянуть за заголовок и растягивать за угол.</div>
      <div class="pl-tools"><button class="btn pl-tidy-all">🧹 Разложить все окна</button></div>
      <div class="pl-list">${ITEMS.map(i => `
        <div class="pl-item" draggable="true" data-id="${i.id}" title="${i.title}">
          <span class="pl-ic">${i.icon}</span>
          <span class="pl-name">${i.title}</span>
          <span class="pl-dot ${i.id === 'gh' || i.id === 'console' ? 'sp' : ''}"></span>
        </div>`).join('')}</div>`;
    pl.querySelector('.pl-close').onclick = () => pl.classList.remove('open');
    pl.querySelector('.pl-tidy').onclick = (e) => { e.stopPropagation(); tidyAll(); };
    pl.querySelector('.pl-tidy-all').onclick = () => { tidyAll(); pl.classList.remove('open'); };
    pl.querySelectorAll('.pl-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.id);
        const ov = $('board-panels');
        if (ov) ov.classList.add('bp-drag');
      });
      el.addEventListener('dragend', () => {
        const ov = $('board-panels');
        if (ov) ov.classList.remove('bp-drag');
      });
      el.addEventListener('click', () => placeAtDefault(el.dataset.id));
    });
  }

  function togglePalette() {
    const pl = $('palette');
    if (!pl) return;
    pl.dataset.built = '1';
    if (!pl.classList.contains('open')) buildPalette();
    pl.classList.toggle('open');
  }

  function placeAtDefault(id) {
    const it = itemOf(id);
    if (!it) return;
    if (layout[id]) {
      const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
      if (t) {
        const l = layout[id];
        const v = visibleRect();
        const hidden = l.x + l.w < v.left || l.y + l.h < v.top || l.x > v.left + v.width || l.y > v.top + v.height;
        if (hidden) {
          const f = flowScan(id, l.w, l.h);
          layout[id].x = f.x; layout[id].y = f.y; layout[id].z = ++zTop;
          t.style.left = f.x + 'px';
          t.style.top = f.y + 'px';
          t.style.zIndex = zTop;
          save();
        } else {
          activateTile(id);
        }
      }
      const pl0 = $('palette');
      if (pl0) pl0.classList.remove('open');
      return;
    }
    const def = it.def;
    const f = flowScan(id, def.w, def.h);
    placeTile(id, f.x, f.y, def.w, def.h);
  }

  /* Авторасположение всех окон по кнопке: каскад колонок в видимой области доски.
     Каждое окно сохраняет свой размер (сужается до ширины колонки),
     расстановка балансируется по высоте (окно идёт в самую низкую колонку). */
  function tidyAll() {
    const ids = Object.keys(layout).filter(id => {
      if (!itemOf(id)) return false;
      return !!document.querySelector('.bp-tile[data-tile="' + id + '"]');
    });
    if (!ids.length) return;
    const v = visibleRect();
    const gap = 16;
    const leftEdge = snap(v.left + 24);
    const topEdge = snap(v.top + 10);
    const rightEdge = Math.max(leftEdge + 400, safeRightX() - 12);
    const availW = rightEdge - leftEdge;
    const widths = ids.map(id => layout[id].w || itemOf(id).def.w);
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    let cols = Math.max(1, Math.floor((availW + gap) / (Math.min(avg, 380) + gap)));
    cols = Math.min(ids.length, cols, Math.max(1, Math.floor((availW + gap) / (MIN_W + gap))));
    const colW = (availW - (cols - 1) * gap) / cols;
    const bottoms = new Array(cols).fill(topEdge);
    const order = ids.slice().sort((a, b) =>
      (layout[a].y - layout[b].y) || (layout[a].x - layout[b].x));
    order.forEach(id => {
      let c = 0;
      for (let i = 1; i < cols; i++) if (bottoms[i] < bottoms[c]) c = i;
      const natW = layout[id].w || itemOf(id).def.w;
      const natH = layout[id].h || itemOf(id).def.h;
      const w = Math.max(MIN_W, Math.min(natW, colW));
      const h = Math.max(MIN_H, natH);
      const x = snap(leftEdge + c * (colW + gap) + (colW - w) / 2);
      const y = snap(bottoms[c]);
      const cl = clamp(id, x, y, w, h);
      const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
      layout[id] = { x: cl.x, y: cl.y, w: cl.w, h: cl.h, z: ++zTop };
      if (t) {
        t.style.left = cl.x + 'px';
        t.style.top = cl.y + 'px';
        t.style.width = cl.w + 'px';
        t.style.height = cl.h + 'px';
        t.style.zIndex = zTop;
      }
      bottoms[c] = cl.y + cl.h + gap;
    });
    save();
  }

  /* ---------- Плитки ---------- */
  function placeTile(id, x, y, w, h) {
    const ov = $('board-panels');
    const it = itemOf(id);
    const p = $(homeOf(id));
    if (!it || !ov || !p) return;
    const old = document.querySelector('.bp-tile[data-tile="' + id + '"]');
    if (old) { activateTile(id); return; }

    setBoardMode(true);
    sysTabOff(id);

    const tw = w || (layout[id] && layout[id].w) || it.def.w;
    const th = h || (layout[id] && layout[id].h) || it.def.h;
    const f = freeSlot(snap(x), snap(y), tw, th, id);
    const c = clamp(id, f.x, f.y, tw, th);
    layout[id] = { x: c.x, y: c.y, w: c.w, h: c.h, z: ++zTop };

    prepPane(p);
    const tile = document.createElement('div');
    tile.className = 'bp-tile';
    tile.setAttribute('data-tile', id);
    tile.style.left = c.x + 'px';
    tile.style.top = c.y + 'px';
    tile.style.width = c.w + 'px';
    tile.style.height = c.h + 'px';
    tile.style.zIndex = c.z;
    tile.innerHTML = `
      <div class="bp-head">
        <span class="bp-title">${it.icon} ${it.title}</span>
        <button class="icon-btn bp-x" title="Убрать с доски">✕</button>
      </div>
      <div class="bp-body"></div>
      <div class="bp-grip" title="Растянуть по ширине и высоте"></div>
      <div class="bp-edge ew" title="Растянуть по ширине"></div>
      <div class="bp-edge ns" title="Растянуть по высоте"></div>`;
    tile.querySelector('.bp-x').onclick = () => removeTile(id, false);
    bindTile(tile, id);
    tile.querySelector('.bp-body').appendChild(p);
    ov.appendChild(tile);

    const fn = loaderOf(id);
    if (fn) try { fn(); } catch (e) {}
    const pl = $('palette');
    if (pl) pl.classList.remove('open');
    save();
    syncPanelVisibility();
  }

  function activateTile(id) {
    const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
    if (t) { t.style.zIndex = (zTop += 2); const d = layout[id]; if (d) d.z = t.style.zIndex; }
  }

  function removeTile(id, silent) {
    try {
      const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
      const p = t && t.querySelector('.bp-body > *');
      const panel = $(panelOf(id));
      if (p && panel) {
        if (p.classList.contains('sp-pane')) {
          if (id !== 'ops' && id !== 'stats') p.classList.remove('active');
        } else p.classList.add('hidden');
        panel.appendChild(p);
      }
      if (t) t.remove();
      delete layout[id];
      const sys = $('#sys-panel');
      if (sys) {
        const s = sys.querySelector('.st-tab[data-sys="' + id + '"]');
        if (s) s.classList.remove('off');
      }
      if (!silent) {
        if (!document.querySelectorAll('.bp-tile').length) {
          setBoardMode(false);
          const pl = $('palette');
          if (pl) pl.classList.remove('open');
        }
        else save();
      }
    } catch (e) {}
    syncPanelVisibility();
  }

  /* Делегированный клик по крестику: плитка убирается всегда,
     даже если у этого экземпляра сломалась привязка onclick. */
  document.addEventListener('click', (e) => {
    const x = e.target.closest && e.target.closest('.bp-x');
    if (!x) return;
    const tile = x.closest('.bp-tile');
    if (!tile) return;
    const id = tile.getAttribute('data-tile');
    if (id && layout[id] !== undefined) removeTile(id, false);
  });

  function bindTile(tile, id) {
    const head = tile.querySelector('.bp-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.bp-x')) return;
      e.preventDefault();
      activateTile(id);
      moveStart(e, tile, id);
    });

    const grip = tile.querySelector('.bp-grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizeStart(e, tile, id);
    });

    const ew = tile.querySelector('.bp-edge.ew');
    if (ew) ew.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizeXStart(e, tile, id);
    });
    const ns = tile.querySelector('.bp-edge.ns');
    if (ns) ns.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizeYStart(e, tile, id);
    });
  }

  function resizeXStart(e0, tile, id) {
    const C = window.CANVAS;
    const p0 = C ? C.toCanvas(e0.clientX, e0.clientY) : { cx: e0.clientX, cy: e0.clientY };
    tile.style.zIndex = ++zTop;
    if (layout[id]) layout[id].z = tile.style.zIndex;
    document.body.style.userSelect = 'none';
    const move = e => {
      const p = C ? C.toCanvas(e.clientX, e.clientY) : { cx: e.clientX, cy: e.clientY };
      const w = Math.max(MIN_W, p.cx - tile.offsetLeft);
      const c = clamp(id, tile.offsetLeft, tile.offsetTop, snap(w), tile.offsetHeight);
      tile.style.width = c.w + 'px';
    };
    const up = () => {
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (layout[id]) {
        layout[id].w = tile.offsetWidth;
        let nx = tile.offsetLeft, ny = tile.offsetTop;
        if (collides(nx, ny, tile.offsetWidth, tile.offsetHeight, id)) {
          const f = freeSlot(nx, ny, tile.offsetWidth, tile.offsetHeight, id);
          layout[id].x = nx = f.x;
          layout[id].y = ny = f.y;
          tile.style.left = nx + 'px';
          tile.style.top = ny + 'px';
        }
      }
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function resizeYStart(e0, tile, id) {
    const C = window.CANVAS;
    const p0 = C ? C.toCanvas(e0.clientX, e0.clientY) : { cx: e0.clientX, cy: e0.clientY };
    tile.style.zIndex = ++zTop;
    if (layout[id]) layout[id].z = tile.style.zIndex;
    document.body.style.userSelect = 'none';
    const move = e => {
      const p = C ? C.toCanvas(e.clientX, e.clientY) : { cx: e.clientX, cy: e.clientY };
      const h = Math.max(MIN_H, p.cy - tile.offsetTop);
      const c = clamp(id, tile.offsetLeft, tile.offsetTop, tile.offsetWidth, snap(h));
      tile.style.height = c.h + 'px';
    };
    const up = () => {
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (layout[id]) {
        layout[id].h = tile.offsetHeight;
        let nx = tile.offsetLeft, ny = tile.offsetTop;
        if (collides(nx, ny, tile.offsetWidth, tile.offsetHeight, id)) {
          const f = freeSlot(nx, ny, tile.offsetWidth, tile.offsetHeight, id);
          layout[id].x = nx = f.x;
          layout[id].y = ny = f.y;
          tile.style.left = nx + 'px';
          tile.style.top = ny + 'px';
        }
      }
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function moveStart(e0, tile, id) {
    const C = window.CANVAS;
    const p0 = C ? C.toCanvas(e0.clientX, e0.clientY) : { cx: e0.clientX, cy: e0.clientY };
    const dx0 = p0.cx - tile.offsetLeft;
    const dy0 = p0.cy - tile.offsetTop;
    tile.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const move = e => {
      const p = C ? C.toCanvas(e.clientX, e.clientY) : { cx: e.clientX, cy: e.clientY };
      const raw = { x: p.cx - dx0, y: p.cy - dy0 };
      const m = mutualSnap(raw.x, raw.y, tile.offsetWidth, tile.offsetHeight, id);
      const c = clamp(id, snap(m.x), snap(m.y), tile.offsetWidth, tile.offsetHeight);
      tile.style.left = c.x + 'px';
      tile.style.top = c.y + 'px';
    };
    const up = () => {
      tile.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (layout[id]) {
        let nx = tile.offsetLeft, ny = tile.offsetTop;
        if (collides(nx, ny, tile.offsetWidth, tile.offsetHeight, id)) {
          const f = freeSlot(nx, ny, tile.offsetWidth, tile.offsetHeight, id);
          nx = f.x; ny = f.y;
          tile.style.left = nx + 'px';
          tile.style.top = ny + 'px';
        }
        layout[id].x = nx;
        layout[id].y = ny;
        layout[id].z = ++zTop;
        tile.style.zIndex = zTop;
      }
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function resizeStart(e0, tile, id) {
    const C = window.CANVAS;
    const p0 = C ? C.toCanvas(e0.clientX, e0.clientY) : { cx: e0.clientX, cy: e0.clientY };
    tile.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const move = e => {
      const p = C ? C.toCanvas(e.clientX, e.clientY) : { cx: e.clientX, cy: e.clientY };
      const w = Math.max(MIN_W, p.cx - tile.offsetLeft);
      const h = Math.max(MIN_H, p.cy - tile.offsetTop);
      const c = clamp(id, tile.offsetLeft, tile.offsetTop, snap(w), snap(h));
      tile.style.width = c.w + 'px';
      tile.style.height = c.h + 'px';
    };
    const up = () => {
      tile.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (layout[id]) {
        layout[id].w = tile.offsetWidth;
        layout[id].h = tile.offsetHeight;
        layout[id].z = ++zTop;
        tile.style.zIndex = zTop;
        let nx = tile.offsetLeft, ny = tile.offsetTop;
        if (collides(nx, ny, tile.offsetWidth, tile.offsetHeight, id)) {
          const f = freeSlot(nx, ny, tile.offsetWidth, tile.offsetHeight, id);
          layout[id].x = nx = f.x;
          layout[id].y = ny = f.y;
          tile.style.left = nx + 'px';
          tile.style.top = ny + 'px';
        }
      }
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function resetTiles() {
    document.querySelectorAll('.bp-tile').forEach(t => {
      const id = t.getAttribute('data-tile');
      const p = t.querySelector('.bp-body > *');
      const panel = panelOf(id) && $(panelOf(id));
      if (p && panel) {
        if (p.classList.contains('sp-pane')) p.classList.remove('active');
        else p.classList.remove('hidden');
        panel.appendChild(p);
      }
      t.remove();
    });
    layout = {};
    active = false;
  }

  function reload() {
    resetTiles();
    restore();
    if (!Object.keys(layout).length) pushServer();
  }

  /* ---------- Drop из каталога ---------- */
  function wireDrop() {
    const ov = $('board-panels');
    if (!ov || ov.dataset.wired) return;
    ov.dataset.wired = '1';
    ov.addEventListener('dragover', e => {
      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/plain')) {
        e.preventDefault();
        ov.classList.add('bp-over');
      }
    });
    ov.addEventListener('dragleave', e => {
      if (!ov.contains(e.relatedTarget)) ov.classList.remove('bp-over');
    });
    ov.addEventListener('drop', e => {
      e.preventDefault();
      ov.classList.remove('bp-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id || !itemOf(id)) return;
      const C = window.CANVAS;
      const p = C ? C.toCanvas(e.clientX, e.clientY) : { cx: e.clientX, cy: e.clientY };
      const def = itemOf(id).def;
      const x = p.cx - (layout[id] ? layout[id].w / 2 : def.w / 2);
      const y = p.cy - 26;
      placeTile(id, x, y, layout[id] ? layout[id].w : def.w, layout[id] ? layout[id].h : def.h);
    });
  }

  function restore() {
    loadState();
    if (!Object.keys(layout).length) return;
    const ov = $('board-panels');
    if (!ov) return;
    setBoardMode(true);
    const v0 = visibleRect();
    Object.keys(layout).forEach(id => {
      const t = layout[id];
      if (!itemOf(id)) { delete layout[id]; return; }
      const off = t.x + (t.w || 80) < v0.left || t.y + (t.h || 60) < v0.top ||
        t.x > v0.left + v0.width || t.y > v0.top + v0.height;
      let dx = t.x || 12, dy = t.y || 110;
      if (off) { const f = flowScan(id, t.w || 80, t.h || 60); dx = f.x; dy = f.y; }
      const c = clamp(id, dx, dy, t.w, t.h);
      layout[id] = { x: c.x, y: c.y, w: c.w, h: c.h, z: ++zTop };
      placeTileDOM(id, layout[id]);
    });
    heal();
    for (const id in layout) {
      const t = layout[id];
      const el = document.querySelector('.bp-tile[data-tile="' + id + '"]');
      if (!el) continue;
      if (collides(t.x, t.y, t.w, t.h, id)) {
        const f = freeSlot(t.x, t.y, t.w, t.h, id);
        t.x = f.x; t.y = f.y;
        el.style.left = f.x + 'px';
        el.style.top = f.y + 'px';
      }
    }
    syncPanelVisibility();
    save();
    if (!document.querySelectorAll('.bp-tile').length) setBoardMode(false);
  }

  function prepPane(p) {
    p.classList.remove('hidden', 'active');
    if (p.classList.contains('sp-pane')) p.classList.add('active');
  }

  function placeTileDOM(id, t) {
    const ov = $('board-panels');
    const it = itemOf(id);
    const p = $(homeOf(id));
    if (!it || !ov || !p) return;
    sysTabOff(id);
    prepPane(p);
    const tile = document.createElement('div');
    tile.className = 'bp-tile';
    tile.setAttribute('data-tile', id);
    tile.style.left = t.x + 'px';
    tile.style.top = t.y + 'px';
    tile.style.width = t.w + 'px';
    tile.style.height = t.h + 'px';
    tile.style.zIndex = t.z;
    tile.innerHTML = `
      <div class="bp-head">
        <span class="bp-title">${it.icon} ${it.title}</span>
        <button class="icon-btn bp-x" title="Убрать с доски">✕</button>
      </div>
      <div class="bp-body"></div>
      <div class="bp-grip" title="Растянуть по ширине и высоте"></div>
      <div class="bp-edge ew" title="Растянуть по ширине"></div>
      <div class="bp-edge ns" title="Растянуть по высоте"></div>`;
    tile.querySelector('.bp-x').onclick = () => removeTile(id, false);
    bindTile(tile, id);
    tile.querySelector('.bp-body').appendChild(p);
    ov.appendChild(tile);
    const fn = loaderOf(id);
    if (fn) try { fn(); } catch (e) {}
  }

  function init() {
    const b = $('btn-place');
    if (b) b.onclick = () => togglePalette();
    const tb = $('btn-tidy');
    if (tb) tb.onclick = () => { tidyAll(); };
    buildPalette();
    wireDrop();

    window.WIDGET = window.WIDGET || {};
    const prevTab = window.WIDGET.tab;
    const prevMinim = window.WIDGET.minim;
    window.WIDGET.tab = function (name) {
      if (active) return;
      if (prevTab) prevTab(name);
    };
    window.WIDGET.minim = function () {
      if (active) return;
      if (prevMinim) prevMinim();
    };

    window.PLACE = window.PLACE || {};
    window.PLACE.reload = reload;
    window.PLACE.tidy = tidyAll;

    restore();
  }

  document.addEventListener('DOMContentLoaded', init);
})();