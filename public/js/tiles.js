'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const STORE = 'kban-tiles';

  const PANES = [
    { id: 'movies', title: '🎬 Вечер', loader: 'movies' },
    { id: 'news', title: '🗞 Новости', loader: 'news' },
    { id: 'music', title: '🎵 Музыка', loader: 'music' },
    { id: 'notif', title: '🔔 Уведомления', loader: 'notif' }
  ];

  let active = false;
  let state = {
    cols: 2,
    sizes: {},
    order: ['movies', 'news', 'music', 'notif']
  };

  function loadState() {
    try { const d = JSON.parse(localStorage.getItem(STORE) || '{}'); if (d && d.order) state = Object.assign(state, d); } catch (e) {}
    for (const p of PANES) if (!state.order.includes(p.id)) state.order.push(p.id);
  }
  function saveState() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  function paneLoader(name) {
    if (name === 'movies') return window.MOVIES && window.MOVIES.load ? window.MOVIES.load : null;
    if (name === 'news') return window.NEWSBTN && window.NEWSBTN.load ? window.NEWSBTN.load : null;
    if (name === 'music') return window.MUSIC && window.MUSIC.load ? window.MUSIC.load : null;
    if (name === 'notif') return window.NOTIFY && window.NOTIFY.loadHistory ? window.NOTIFY.loadHistory : null;
    return null;
  }

  function isActive() { return active; }

  function gridOf() { return $('side-widget').querySelector('.sw-tiling-grid'); }

  function enable() {
    active = true;
    loadState();
    const sw = $('side-widget');
    sw.classList.add('tiling');
    sw.setAttribute('data-tiling', '1');
    const old = sw.querySelector('.sw-tiling-grid');
    if (old) old.remove();

    const grid = document.createElement('div');
    grid.className = 'sw-tiling-grid';
    sw.insertBefore(grid, sw.querySelector('.sw-head').nextSibling);

    state.order.forEach(id => {
      const pane = $('sw-' + id);
      if (!pane) return;
      const tile = document.createElement('div');
      tile.className = 'sw-tile';
      tile.setAttribute('data-tile', id);

      const bar = document.createElement('div');
      bar.className = 'sw-tile-bar';
      bar.setAttribute('draggable', 'true');
      bar.innerHTML = `<span class="sw-tile-name">${titleOf(id)}</span>`;

      const grip = document.createElement('div');
      grip.className = 'sw-tile-grip';
      grip.title = 'Изменить размер';

      pane.classList.remove('hidden', 'active');

      tile.appendChild(bar);
      tile.appendChild(pane);
      tile.appendChild(grip);
      grid.appendChild(tile);
    });

    paintTiles();
    state.order.forEach(id => { const fn = paneLoader(id); if (fn) try { fn(); } catch (e) {} });
    bindGrid(grid);
    grid.querySelectorAll('.sw-tile').forEach(t => bindTile(t));
  }

  function bindTile(tile) {
    tile.addEventListener('dragstart', e => {
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tile.getAttribute('data-tile'));
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      saveDomOrder();
    });
    const grip = tile.querySelector('.sw-tile-grip');
    if (grip) {
      grip.addEventListener('mousedown', resizeStart(tile, tile.getAttribute('data-tile')));
      grip.addEventListener('touchstart', e => { e.preventDefault(); resizeStart(tile, tile.getAttribute('data-tile'))(e.touches[0]); }, { passive: false });
    }
  }

  function disable() {
    active = false;
    const sw = $('side-widget');
    sw.classList.remove('tiling');
    sw.removeAttribute('data-tiling');
    const grid = gridOf();
    if (grid) {
      grid.querySelectorAll('.sw-tile').forEach(t => {
        const pane = t.querySelector('.sw-pane');
        const head = sw.querySelector('.sw-head');
        sw.insertBefore(pane, head.nextSibling);
        pane.classList.add('hidden');
        t.remove();
      });
    }
    saveState();
    window.WIDGET.tab('movies');
  }

  function toggle() {
    if (active) disable(); else enable();
    const b = $('sw-tiling');
    if (b) b.classList.toggle('on', active);
  }

  function titleOf(id) {
    const p = PANES.find(x => x.id === id);
    return p ? p.title : id;
  }

  function paintTiles() {
    const grid = gridOf();
    if (!grid) return;
    grid.style.gridTemplateColumns = `repeat(${Math.max(2, state.cols)}, 1fr)`;
    state.order.forEach(id => {
      const tile = grid.querySelector(`.sw-tile[data-tile="${id}"]`);
      if (!tile) return;
      const size = state.sizes[id] || {};
      if (size.w && size.w > 0) {
        const span = Math.min(state.cols, Math.max(1, Math.round(size.w * state.cols)));
        tile.style.gridColumn = 'span ' + span;
      }
      if (size.h) tile.style.height = size.h + 'px';
    });
  }

  function collectSizes() {
    const grid = gridOf();
    if (!grid) return;
    const total = grid.clientWidth;
    if (!total) return;
    grid.querySelectorAll('.sw-tile').forEach(t => {
      const id = t.getAttribute('data-tile');
      const w = t.getBoundingClientRect().width / total;
      const h = t.getBoundingClientRect().height;
      state.sizes[id] = { w, h };
    });
  }

  function bindGrid(grid) {
    grid.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = grid.querySelector('.sw-tile.dragging');
      if (!dragging) return;
      const after = afterTile(grid, e.clientY);
      if (after == null) grid.appendChild(dragging);
      else grid.insertBefore(dragging, after);
    });
    grid.addEventListener('drop', e => {
      e.preventDefault();
      saveDomOrder();
    });
  }

  function afterTile(grid, y) {
    const tiles = Array.from(grid.querySelectorAll('.sw-tile:not(.dragging)'));
    return tiles.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function saveDomOrder() {
    const grid = gridOf();
    if (!grid) return;
    state.order = Array.from(grid.querySelectorAll('.sw-tile')).map(t => t.getAttribute('data-tile'));
    collectSizes();
    saveState();
  }

  function resizeHandle(tile, id) {
    const grid = gridOf();
    const col = Math.max(2, state.cols);
    const gapBase = grid.clientWidth / col || 1;
    return { tile, id, col, gapBase };
  }

  function resizeStart(tile, id) {
    const h = resizeHandle(tile, id);
    const start = {
      x: 0, y: 0, w: tile.getBoundingClientRect().width, ht: tile.getBoundingClientRect().height
    };
    return function (e) {
      start.x = e.clientX; start.y = e.clientY;
      const move = evt => {
        const dx = (evt.clientX - start.x) / h.gapBase;
        const span = Math.min(h.col, Math.max(1, Math.round(start.w / h.gapBase + dx)));
        const dy = Math.max(80, start.ht + (evt.clientY - start.y));
        tile.style.gridColumn = 'span ' + span;
        tile.style.height = dy + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('touchmove', mv);
        document.removeEventListener('touchend', up);
        collectSizes();
        saveState();
      };
      const mv = evt => { evt.preventDefault(); move(evt.touches[0]); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', mv, { passive: false });
      document.addEventListener('touchend', up);
    };
  }

  function init() {
    loadState();
    const b = $('sw-tiling');
    if (b) b.onclick = () => toggle();
    window.WIDGET = window.WIDGET || {};
    const prevTab = window.WIDGET.tab;
    window.WIDGET.tab = function (name) {
      if (active) return;
      if (prevTab) prevTab(name);
    };
    const prevMinim = window.WIDGET.minim;
    window.WIDGET.minim = function () {
      if (active) return;
      if (prevMinim) prevMinim();
    };
    window.addEventListener('resize', () => { if (active) paintTiles(); });
  }

  document.addEventListener('DOMContentLoaded', init);
  window.TILES = { toggle, isActive };
})();