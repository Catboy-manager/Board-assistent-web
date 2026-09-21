'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const STORE = 'kban-board-layout';
  const SNAP = 12;
  const MIN_W = 240;
  const MIN_H = 170;

  const ITEMS = [
    { id: 'movies',  icon: '🎬', title: 'Вечер',    def: { w: 310, h: 380 } },
    { id: 'news',    icon: '🗞', title: 'Новости',  def: { w: 330, h: 400 } },
    { id: 'music',   icon: '🎵', title: 'Музыка',   def: { w: 310, h: 340 } },
    { id: 'notif',   icon: '🔔', title: 'Уведомл.', def: { w: 300, h: 330 } },
    { id: 'gh',      icon: '⭐', title: 'GitHub',   def: { w: 330, h: 380 } },
    { id: 'console', icon: '🖥', title: 'Консоль',  def: { w: 350, h: 320 } }
  ];

  let layout = {};
  let zTop = 10;
  let active = false;

  function itemOf(id) { return ITEMS.find(i => i.id === id); }
  function homeOf(id) { return id === 'gh' ? 'sp-gh' : id === 'console' ? 'sp-console' : 'sw-' + id; }
  function loaderOf(id) {
    if (id === 'news') return () => window.NEWSBTN && window.NEWSBTN.load();
    if (id === 'gh') return () => window.GHBTN && window.GHBTN.load();
    if (id === 'console') return () => window.CONS && window.CONS.load();
    if (id === 'music') return () => window.MUSIC && window.MUSIC.load();
    if (id === 'notif') return () => window.NOTIFY && window.NOTIFY.loadHistory();
    return () => window.MOVIES && window.MOVIES.load();
  }
  const snap = v => Math.round(v / SNAP) * SNAP;

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
    const ov = $('board-panels');
    return ov ? ov.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  }

  function clamp(id, x, y, w, h) {
    const box = boardBox();
    const innerW = box.width;
    x = Math.max(8, Math.min(innerW - w - 8, x));
    y = Math.max(72, Math.min(box.height - h - 16, y));
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
  }

  function restoreSysTabs() {
    document.querySelectorAll('#sys-panel .st-tab[data-sys="gh"], #sys-panel .st-tab[data-sys="console"]')
      .forEach(t => t.classList.remove('off'));
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

    const c = clamp(id, snap(x), snap(y), w || (layout[id] && layout[id].w) || it.def.w, h || (layout[id] && layout[id].h) || it.def.h);
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
      <div class="bp-grip" title="Растянуть"></div>`;
    tile.querySelector('.bp-x').onclick = () => removeTile(id, false);
    bindTile(tile, id);
    tile.querySelector('.bp-body').appendChild(p);
    ov.appendChild(tile);

    const fn = loaderOf(id);
    if (fn) try { fn(); } catch (e) {}
    save();
  }

  function activateTile(id) {
    const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
    if (t) { t.style.zIndex = (zTop += 2); const d = layout[id]; if (d) d.z = t.style.zIndex; }
  }

  function removeTile(id, silent) {
    const t = document.querySelector('.bp-tile[data-tile="' + id + '"]');
    const p = t && t.querySelector('.bp-body > *');
    const home = $(homeOf(id));
    if (p && home) {
      if (p.classList.contains('sp-pane')) p.classList.remove('active');
      else p.classList.add('hidden');
      home.appendChild(p);
    }
    if (t) t.remove();
    delete layout[id];
    const sys = $('#sys-panel');
    if (sys) {
      const s = sys.querySelector('.st-tab[data-sys="' + id + '"]');
      if (s) s.classList.remove('off');
    }
    if (!silent) {
      if (!document.querySelectorAll('.bp-tile').length) setBoardMode(false);
      else save();
    }
  }

  function bindTile(tile, id) {
    const head = tile.querySelector('.bp-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.bp-x')) return;
      e.preventDefault();
      moveStart(e, tile, id);
    });

    const grip = tile.querySelector('.bp-grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      resizeStart(e, tile, id);
    });
  }

  function moveStart(e0, tile, id) {
    const box = boardBox();
    const dx0 = e0.clientX - box.left - tile.offsetLeft;
    const dy0 = e0.clientY - box.top - tile.offsetTop;
    tile.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const move = e => {
      const c = clamp(id, snap(e.clientX - box.left - dx0), snap(e.clientY - box.top - dy0), tile.offsetWidth, tile.offsetHeight);
      tile.style.left = c.x + 'px';
      tile.style.top = c.y + 'px';
    };
    const up = () => {
      tile.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (layout[id]) {
        layout[id].x = tile.offsetLeft;
        layout[id].y = tile.offsetTop;
        layout[id].z = ++zTop;
        tile.style.zIndex = zTop;
      }
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function resizeStart(e0, tile, id) {
    const r = tile.getBoundingClientRect();
    tile.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const move = e => {
      const w = Math.max(MIN_W, e.clientX - r.left);
      const h = Math.max(MIN_H, e.clientY - r.top);
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
      const r = ov.getBoundingClientRect();
      const def = itemOf(id).def;
      const x = e.clientX - r.left - (layout[id] ? layout[id].w / 2 : def.w / 2);
      const y = e.clientY - r.top - 26;
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
      <div class="bp-grip" title="Растянуть"></div>`;
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