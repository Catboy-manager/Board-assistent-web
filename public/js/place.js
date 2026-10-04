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
    { id: 'interests', icon: '🧠', title: 'Интересы', def: { w: 340, h: 400 } }
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
      const d = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (d && typeof d === 'object') layout = d;
    } catch (e) {}
  }
  function save() {
    try {
      if (active) localStorage.setItem(STORE, JSON.stringify(layout));
      else localStorage.removeItem(STORE);
    } catch (e) {}
  }

  function boardBox() {
    const C = window.CANVAS;
    if (!C || !C.visible) return { left: 12, top: 72, width: 2000, height: 1200 };
    return C.visible();
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
    const opEl = $('ops-panel'), stEl = $('stats-panel'), sysEl = $('sys-panel'), ytEl = $('yt-panel'), intEl = $('interests-panel');
    if (opEl) opEl.classList.toggle('hidden', !!layout.ops);
    if (stEl) stEl.classList.toggle('hidden', !!layout.stats);
    if (sysEl) sysEl.classList.toggle('hidden', !!(layout.gh && layout.console));
    if (ytEl) ytEl.classList.toggle('hidden', !!layout.yt);
    if (intEl) intEl.classList.toggle('hidden', !!layout.interests);
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
        <button class="icon-btn pl-close" title="Закрыть каталог">✕</button>
      </div>
      <div class="pl-hint">Перетащите на доску или нажмите — панель встанет и её можно тянуть за заголовок и растягивать за угол.</div>
      <div class="pl-list">${ITEMS.map(i => `
        <div class="pl-item" draggable="true" data-id="${i.id}" title="${i.title}">
          <span class="pl-ic">${i.icon}</span>
          <span class="pl-name">${i.title}</span>
          <span class="pl-dot ${i.id === 'gh' || i.id === 'console' ? 'sp' : ''}"></span>
        </div>`).join('')}</div>`;
    pl.querySelector('.pl-close').onclick = () => pl.classList.remove('open');
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
    const box = boardBox();
    if (layout[id]) {
      activateTile(id);
      return;
    }
    const def = it.def;
    let x = 12, y = 110;
    const C = window.CANVAS;
    if (C && C.visible) {
      const v = C.visible();
      x = Math.max(12, v.left + 24);
      y = Math.max(12, v.top + 80);
    }
    for (const k in layout) {
      const t = layout[k];
      if (Math.abs(t.x - x) < def.w / 2) y = Math.max(y, t.y + t.h + 10);
    }
    placeTile(id, x, y, def.w, def.h);
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
    const box = boardBox();
    Object.keys(layout).forEach(id => {
      const t = layout[id];
      if (!itemOf(id)) { delete layout[id]; return; }
      const c = clamp(id, t.x || 12, t.y || 110, t.w, t.h);
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

    restore();
  }

  document.addEventListener('DOMContentLoaded', init);
})();