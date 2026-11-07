'use strict';

window.APP = {
  db: null,
  opts: {},

  async init() {
    this.db = await this.fetchData();
    this.render();
    if (window.PLACE) try { window.PLACE.reload(); } catch (e) {}
    this.initClock();
    this.applyBg();
    this.initDragTouch();
    this.updateEventsBadge();
    setInterval(() => this.checkEvents(), 20000);

    document.getElementById('btn-settings').onclick = () => this.openSettings();
    document.getElementById('btn-guide').onclick = () => this.openGuide();
    document.getElementById('btn-add-column').onclick = () => this.addColumn();
    document.getElementById('btn-add-event').onclick = () => this.openAddEvent();

    const close = this.close.bind(this);
    document.querySelectorAll('[data-close]').forEach(el => {
      el.onclick = () => close(el.dataset.close);
    });
    document.getElementById('overlay').onclick = () => this.closeAll();

    if (window.matchMedia('(min-width: 1000px)').matches) {
      document.getElementById('ai-panel').classList.remove('hidden');
      document.getElementById('btn-ai-toggle').classList.add('hidden');
      if (window.AI_INIT) window.AI_INIT();
    }
    this.initResizer();

    if (!localStorage.getItem('kanbanGuideSeen')) {
      setTimeout(() => { this.openGuide(); try { localStorage.setItem('kanbanGuideSeen', '1'); } catch (e) {} }, 350);
    }
  },

  async fetchData() {
    try {
      const res = await fetch('/api/data');
      return await res.json();
    } catch (e) { return this.fallbackDb(); }
  },
  fallbackDb() {
    return { board: { columns: [{ id: 'c1', title: 'Задачи', color: '#f5b7b1' }, { id: 'c2', title: 'В работе', color: '#aed6f1' }, { id: 'c3', title: 'Готово', color: '#a9dfbf' }], cards: [] }, events: [], settings: { background: { type: 'color', value: '#1e2a3a' } } };
  },
  async save() {
    try {
      const res = await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.db) });
      const r = await res.json().catch(() => null);
      if (r && r.db) {
        this.db = r.db;
        this.render();
        this.updateEventsBadge();
      }
    } catch (e) { console.error('save fail', e); }
  },

  /* ---- Clock ---- */
  initClock() {
    const el = document.getElementById('clock');
    const tick = () => { el.textContent = new Date().toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
    tick(); setInterval(tick, 30000);
  },

  /* ---- Background ---- */
  applyBg() {
    const s = this.db.settings && this.db.settings.background;
    const el = document.getElementById('bg');
    const blur = (s && s.blur) || 0;
    const darken = (s && s.darken) || 0;
    el.style.backgroundImage = 'none';
    el.style.backgroundSize = '';
    el.style.backgroundPosition = '';
    el.style.filter = '';
    if (!s || s.type === 'color') {
      el.style.background = (s && s.value) || '#1e2a3a';
    } else if (s.type === 'image') {
      el.style.background = 'none';
      el.style.backgroundImage = 'url(' + s.src + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }
    if (blur || darken) el.style.filter = `blur(${blur}px) brightness(${1 - darken / 100})`;
    this.adaptBgTheme(s);
  },

  /* ---- Адаптация цветов к фону ---- */
  parseHex(h) {
    h = String(h || '').trim();
    let m = h.match(/^#?([0-9a-f]{6})$/i);
    if (m) return { r: parseInt(m[1].substr(0, 2), 16), g: parseInt(m[1].substr(2, 2), 16), b: parseInt(m[1].substr(4, 2), 16) };
    m = h.match(/^#?([0-9a-f]{3})$/i);
    if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
    return null;
  },
  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  },
  hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = t => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: Math.round(f(h + 1 / 3) * 255), g: Math.round(f(h) * 255), b: Math.round(f(h - 1 / 3) * 255) };
  },
  rgbStr(c, a) {
    return a == null ? `rgb(${c.r},${c.g},${c.b})` : `rgba(${c.r},${c.g},${c.b},${a})`;
  },
  lumaOf(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; },

  extractPalette(src) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        try {
          const S = 48;
          const cv = document.createElement('canvas');
          cv.width = S; cv.height = S;
          const g = cv.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, S, S);
          const d = g.getImageData(0, 0, S, S).data;
          const bins = new Map();
          let lumaSum = 0;
          let px = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 10) continue;
            px++; lumaSum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            const key = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4);
            bins.set(key, (bins.get(key) || 0) + 1);
          }
          const avgLuma = px ? lumaSum / px : 0;
          let best = null, bs = -1;
          for (const [key, count] of bins) {
            const [r, gg, bb] = key.split(',').map(Number);
            const c = { r: r * 16 + 8, g: gg * 16 + 8, b: bb * 16 + 8 };
            const s = this.rgbToHsl(c.r, c.g, c.b).s;
            const score = count * (0.35 + s);
            if (score > bs) { bs = score; best = c; }
          }
          res(best ? { dominant: best, luma: avgLuma } : null);
        } catch (e) { res(null); }
      };
      img.onerror = () => res(null);
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
  },

  applyTheme(base, avgLuma) {
    const root = document.documentElement;
    if (!base) { this.resetTheme(); return; }
    const l = this.lumaOf(base);
    if (l < 8) { this.resetTheme(); return; }
    const { h, s } = this.rgbToHsl(base.r, base.g, base.b);
    const sat = Math.min(0.85, Math.max(0.45, s));
    const acc = this.hslToRgb(h, sat, 0.62);
    const acc2 = this.hslToRgb((h + 48) % 360, Math.min(0.8, sat + 0.1), 0.6);
    const solid = this.hslToRgb(h, Math.min(0.5, s * 0.7), 0.13);
    const pane2 = this.hslToRgb(h, Math.min(0.4, s * 0.6), 0.19);
    const bright = (avgLuma != null ? avgLuma : l) > 120;
    root.style.setProperty('--accent', this.rgbStr(acc));
    root.style.setProperty('--accent-2', this.rgbStr(acc2));
    root.style.setProperty('--panel-solid', this.rgbStr(solid));
    root.style.setProperty('--panel', this.rgbStr(solid, 0.82));
    root.style.setProperty('--panel-2', this.rgbStr(pane2, 0.9));
    root.style.setProperty('--border', this.rgbStr(acc, 0.28));
    root.style.setProperty('--text', bright ? '#f5f8fc' : '#e8eef5');
    root.style.setProperty('--muted', this.rgbStr(this.hslToRgb(h, 0.12, bright ? 0.72 : 0.64)));
  },

  resetTheme() {
    const root = document.documentElement;
    const def = {
      '--panel': 'rgba(22, 27, 34, 0.82)',
      '--panel-solid': '#161b22',
      '--panel-2': 'rgba(30, 37, 48, 0.9)',
      '--border': 'rgba(255, 255, 255, 0.09)',
      '--text': '#e8eef5',
      '--muted': '#9aa7b8',
      '--accent': '#58a6ff',
      '--accent-2': '#3fb950'
    };
    for (const k in def) root.style.setProperty(k, def[k]);
  },

  adaptBgTheme(s) {
    if (!s || s.adapt === false) { this.resetTheme(); return; }
    if (s.type === 'image' && s.src) {
      this.extractPalette(s.src).then(p => this.applyTheme(p ? p.dominant : null, p ? p.luma : null));
      return;
    }
    if (s.type === 'color') {
      const c = this.parseHex(s.value);
      if (c) { this.applyTheme(c, this.lumaOf(c)); return; }
    }
    this.resetTheme();
  },

  /* ---- Render ---- */
  colPos() {
    try { return JSON.parse(localStorage.getItem('kban-cols') || '{}'); } catch (e) { return {}; }
  },

  colPosSave(map) {
    try { localStorage.setItem('kban-cols', JSON.stringify(map || this.colPos())); } catch (e) { /* ignore */ }
  },

  render() {
    const inner = document.getElementById('board-inner');
    inner.innerHTML = '';
    const { columns, cards } = this.db.board;
    const pos = this.colPos();
    const autoMode = columns.every(c => pos[c.id] === undefined);
    let safeMaxX = 1800;
    const C0 = window.CANVAS;
    if (C0 && C0.safeRight) safeMaxX = Math.max(300, C0.safeRight() - 300);
    let ax = 24, ay = 80, lineH = 0;
    columns.forEach(col => {
      const colCards = cards.filter(c => c.columnId === col.id);
      const div = document.createElement('div');
      div.className = 'column';
      div.dataset.col = col.id;
      div.style.setProperty('--col-color', col.color || '#888');
      let px = pos[col.id] ? pos[col.id].x : null;
      let py = pos[col.id] ? pos[col.id].y : null;
      if (px === null || py === null) { px = ax; py = ay; ax += 320; if (ax > safeMaxX) { ax = 24; ay += 400; } lineH = Math.max(lineH, 0); }
      else {
        let minTop = 0, maxX = 1800;
        const C = window.CANVAS;
        if (C && C.safeTop) minTop = C.safeTop();
        if (C && C.safeRight) maxX = Math.max(24, C.safeRight() - 300);
        if (py < minTop) py = minTop;
        if (px > maxX) px = maxX;
      }
      div.style.left = px + 'px';
      div.style.top = py + 'px';
      div.style.position = 'absolute';
      div.innerHTML = `
        <div class="column-head">
          <span class="column-title">${this.esc(col.title)}</span>
          <span class="col-count">${colCards.length}</span>
          <button class="icon-btn col-menu" title="Меню колонки">⋯</button>
        </div>
        <div class="col-body" data-col="${col.id}"></div>
        <button class="add-card" data-col="${col.id}">+ Карточка</button>
      `;
      if (autoMode) {
        const p = this.colPos();
        p[col.id] = { x: px, y: py };
        this.colPosSave(p);
      }
      const menu = div.querySelector('.col-menu');
      menu.onclick = (e) => { e.stopPropagation(); this.openEditColumn(col); };
      div.querySelector('.add-card').onclick = () => this.openAddCard(col.id);
      const body = div.querySelector('.col-body');
      colCards.forEach(card => body.appendChild(this.makeCard(card)));
      inner.appendChild(div);
      this.bindColDrag(div, col.id);
    });
  },

  bindColDrag(div, colId) {
    const head = div.querySelector('.column-head');
    if (!head || head.dataset.drag) return;
    head.dataset.drag = '1';
    let start = null;
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
      const C = window.CANVAS;
      if (!C) return;
      e.preventDefault();
      const p0 = C.toCanvas(e.clientX, e.clientY);
      const sx = div.offsetLeft, sy = div.offsetTop;
      div.style.zIndex = 100;
      start = { p0, sx, sy };
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      document.body.style.userSelect = 'none';
    });
    head.addEventListener('pointermove', e => {
      if (!start) return;
      const p = window.CANVAS.toCanvas(e.clientX, e.clientY);
      let minTop = 0, maxX = 1800;
      if (window.CANVAS.safeTop) minTop = window.CANVAS.safeTop();
      if (window.CANVAS.safeRight) maxX = Math.max(24, window.CANVAS.safeRight() - 300);
      div.style.left = Math.min(maxX, start.sx + (p.cx - start.p0.cx)) + 'px';
      div.style.top = Math.max(minTop, start.sy + (p.cy - start.p0.cy)) + 'px';
    });
    const up = () => {
      if (!start) return;
      start = null;
      div.style.zIndex = '';
      document.body.style.userSelect = '';
      const pos = this.colPos();
      pos[colId] = { x: div.offsetLeft, y: div.offsetTop };
      this.colPosSave(pos);
    };
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  },

  makeCard(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.card = card.id;
    el.draggable = true;
    let html = '';
    if (card.title) html += `<div class="card-title">${this.esc(card.title)}</div>`;
    if (card.text) html += `<div class="card-text">${this.esc(card.text)}</div>`;
    let meta = '';
    if (card.due) {
      const d = new Date(card.due);
      const now = Date.now();
      const diff = d - now;
      const soon = diff > 0 && diff < 86400000;
      const passed = diff < 0;
      meta += `<span class="chip due${soon ? ' soon' : ''}">${passed ? '⏱ ' : '📅 '}${d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>`;
    }
    if (card.priority) { const pn = { high: ['Важно', 'prio-p'], med: ['Средне', 'prio-m'], low: ['Низкий', 'prio-l'] }[card.priority] || []; if (pn[0]) meta += `<span class="chip ${pn[1]}">${pn[0]}</span>`; }
    if (meta) html += `<div class="card-meta">${meta}</div>`;
    el.innerHTML = html;
    el.onclick = (ev) => { if (!el.classList.contains('dragging')) this.openEditCard(card); };
    el.ondragstart = (e) => { el.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; };
    el.ondragend = () => el.classList.remove('dragging');
    return el;
  },

  /* ---- Columns ---- */
  addColumn() {
    const self = this;
    this.openModal(`
      <div class="modal-head"><h3>Новая колонка</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <label>Название колонки</label>
        <input type="text" id="m-col-new" placeholder="Например: В работе" autofocus>
      </div>
      <div class="modal-foot">
        <button class="btn" data-cancel-col>Отмена</button>
        <button class="btn primary" data-save-col>Создать</button>
      </div>
    `);
    const input = document.getElementById('m-col-new');
    if (input) input.focus();
    const close = () => self.closeModal();
    const save = () => {
      const title = (document.getElementById('m-col-new').value || '').trim();
      if (!title) { if (input) input.focus(); return; }
      const colors = ['#f5b7b1','#aed6f1','#a9dfbf','#f9e79f','#d7bde2','#fadbd8'];
      self.db.board.columns.push({ id: 'col_' + Date.now().toString(36), title, color: colors[self.db.board.columns.length % colors.length] });
      self.save(); self.render();
      close();
    };
    document.querySelector('[data-cancel-col]').onclick = close;
    document.querySelector('[data-save-col]').onclick = save;
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  },
  openEditColumn(col) {
    this.openModal(`
      <div class="modal-head"><h3>Колонка</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <label>Название</label><input type="text" id="m-col-title" value="${this.esc(col.title)}">
        <div class="column-color-row"><label style="margin:0">Цвет</label><input type="color" id="m-col-color" value="${col.color || '#888888'}"></div>
      </div>
      <div class="modal-foot">
        <button class="btn danger-btn" data-del-col>Удалить</button>
        <button class="btn primary" data-save-col>Сохранить</button>
      </div>
    `);
    document.querySelector('[data-del-col]').onclick = () => { (this.db._deleted = this.db._deleted || { cards: [], columns: [], events: [] }); this.db._deleted.columns.push(col.id); for (const c of this.db.board.cards) if (c.columnId === col.id) this.db._deleted.cards.push(c.id); this.db.board.cards = this.db.board.cards.filter(c => c.columnId !== col.id); this.db.board.columns = this.db.board.columns.filter(c => c.id !== col.id); this.save(); this.render(); this.closeModal(); };
    document.querySelector('[data-save-col]').onclick = () => { col.title = document.getElementById('m-col-title').value.trim() || col.title; col.color = document.getElementById('m-col-color').value; this.save(); this.render(); this.closeModal(); };
  },

  /* ---- Cards ---- */
  openAddCard(columnId) {
    this.openCardModal({ id: null, columnId, title: '', text: '', priority: '', due: '' });
  },
  openEditCard(card) {
    this.openCardModal(card);
  },
  openCardModal(card) {
    const isNew = !card.id;
    const cardId = card.id || 'card_' + Date.now().toString(36);
    const colOptions = this.db.board.columns.map(c => `<option value="${c.id}" ${c.id === card.columnId ? 'selected' : ''}>${this.esc(c.title)}</option>`).join('');
    this.openModal(`
      <div class="modal-head"><h3>${isNew ? 'Новая карточка' : 'Карточка'}</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <label>Заголовок</label><input type="text" id="m-card-title" value="${this.esc(card.title)}">
        <label>Текст</label><textarea id="m-card-text" rows="3">${this.esc(card.text || '')}</textarea>
        <div class="field-row">
          <div><label>Колонка</label><select id="m-card-col">${colOptions}</select></div>
          <div><label>Приоритет</label><select id="m-card-prio">
            <option value="">Без</option>
            <option value="low" ${card.priority==='low'?'selected':''}>Низкий</option>
            <option value="med" ${card.priority==='med'?'selected':''}>Средний</option>
            <option value="high" ${card.priority==='high'?'selected':''}>Важный</option>
          </select></div>
        </div>
        <label>Напоминание (дата/время)</label><input type="datetime-local" id="m-card-due" value="${card.due ? card.due.slice(0,16) : ''}">
      </div>
      <div class="modal-foot">
        ${!isNew ? '<button class="btn danger-btn" data-del-card>Удалить</button>' : ''}
        <button class="btn primary" data-save-card>${isNew ? 'Создать' : 'Сохранить'}</button>
      </div>
    `);
    if (!isNew) document.querySelector('[data-del-card]').onclick = () => { (this.db._deleted = this.db._deleted || { cards: [], columns: [], events: [] }).cards.push(card.id); this.db.board.cards = this.db.board.cards.filter(c => c.id !== card.id); this.save(); this.render(); this.closeModal(); };
    document.querySelector('[data-save-card]').onclick = () => {
      const t = document.getElementById('m-card-title').value.trim();
      if (!t) return;
      const due = document.getElementById('m-card-due').value;
      const updated = { id: cardId, columnId: document.getElementById('m-card-col').value, title: t, text: document.getElementById('m-card-text').value.trim(), priority: document.getElementById('m-card-prio').value, due: due ? new Date(due).toISOString() : '' };
      if (isNew) this.db.board.cards.push(updated);
      else Object.assign(card, updated);
      this.save(); this.render(); this.closeModal();
    };
  },

  /* ---- Events ---- */
  openEvents() {
    document.getElementById('events-panel').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    this.renderEvents();
  },
  renderEvents() {
    const el = document.getElementById('events-list');
    if (!this.db.events.length) { el.innerHTML = '<div class="empty-state">Нет событий</div>'; return; }
    el.innerHTML = this.db.events.slice().sort((a, b) => new Date(a.when) - new Date(b.when)).map(ev => {
      const d = new Date(ev.when);
      const passed = d < new Date();
      return `<div class="event-row ${passed ? 'passed' : ''}">
        <div class="ev-time">${d.toLocaleString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
        <div class="ev-title">${this.esc(ev.title)}</div>
        ${ev.note ? `<div class="ev-note">${this.esc(ev.note)}</div>` : ''}
        <div class="ev-bar"><small>${passed ? 'Прошло' : 'Через ' + this.humanDur(d - new Date())}</small>
        <button class="btn danger-btn" style="padding:4px 8px;font-size:12px" data-ev-del="${ev.id}">Удалить</button></div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-ev-del]').forEach(b => {
      b.onclick = () => { (this.db._deleted = this.db._deleted || { cards: [], columns: [], events: [] }).events.push(b.dataset.evDel); this.db.events = this.db.events.filter(e => e.id !== b.dataset.evDel); this.save(); this.renderEvents(); this.updateEventsBadge(); };
    });
  },
  openAddEvent() {
    const now = new Date();
    const next = new Date(now.getTime() + 3600000);
    const iso = next.toISOString().slice(0, 16);
    this.openModal(`
      <div class="modal-head"><h3>Новое событие</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <label>Название</label><input type="text" id="m-ev-title">
        <label>Описание</label><textarea id="m-ev-note" rows="2"></textarea>
        <label>Когда</label><input type="datetime-local" id="m-ev-when" value="${iso}">
      </div>
      <div class="modal-foot"><button class="btn primary" data-save-ev>Добавить</button></div>
    `);
    document.querySelector('[data-save-ev]').onclick = () => {
      const title = document.getElementById('m-ev-title').value.trim();
      if (!title) return;
      this.db.events.push({ id: 'ev_' + Date.now().toString(36), title, note: document.getElementById('m-ev-note').value.trim(), when: new Date(document.getElementById('m-ev-when').value).toISOString(), notified: false });
      this.save(); this.closeModal(); this.renderEvents(); this.updateEventsBadge();
      this.toast('Событие добавлено: ' + title);
    };
  },

  humanDur(ms) {
    if (ms < 0) return '0 мин';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return mins + ' мин';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return h + ' ч ' + m + ' мин';
    return Math.floor(h / 24) + ' д ' + (h % 24) + ' ч';
  },
  updateEventsBadge() {
    const now = Date.now();
    const count = this.db.events.filter(e => new Date(e.when).getTime() > now).length;
    const b = document.getElementById('events-badge');
    if (count > 0) { b.textContent = count; b.classList.remove('hidden'); } else b.classList.add('hidden');
  },
  checkEvents() {
    const now = Date.now();
    let changed = false;
    this.db.events.forEach(ev => {
      if (!ev.notified && new Date(ev.when).getTime() <= now) {
        ev.notified = true;
        changed = true;
        this.notifySystem(ev.title, ev.note || 'Наступило время события');
        this.toast(ev.title, ev.note, true);
      }
    });
    if (changed) this.save();
    this.updateEventsBadge();
  },

  /* ---- Settings ---- */
  openSettings() {
    const s = this.db.settings.background || {};
    const gradients = [
      { name: 'Тёмная', type: 'color', value: '#1e2a3a' },
      { name: 'Космос', type: 'color', value: '#0f0c29' },
      { name: 'Океан', type: 'color', value: '#00204a' },
      { name: 'Лес', type: 'color', value: '#122018' },
      { name: 'Закат', type: 'color', value: '#2c1b1f' },
      { name: 'Яркий', type: 'color', value: '#2b4a6e' }
    ];
    this.openModal(`
      <div class="modal-head"><h3>Настройки</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
          <div class="tabs">
            <button class="tab active" data-tab="bg">🎨 Фон</button>
            <button class="tab" data-tab="ui">🧪 Интерфейс</button>
            <button class="tab" data-tab="ai">🤖 ИИ</button>
            <button class="tab" data-tab="panels">🧩 Панели</button>
            <button class="tab" data-tab="update">🔄 Обновления</button>
          </div>
          <div class="tab-pane active" id="pane-bg">
          <label>Фоновый цвет</label>
          <div class="bg-presets" id="bg-presets">
            ${gradients.map((g, i) => `<div class="bg-preset${(s.type==='color' && s.value===g.value) ? ' sel' : ''}" style="background:${g.value}" data-bg-idx="${i}" title="${g.name}"></div>`).join('')}
            <div class="bg-preset" style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e)" data-bg-idx="custom" title="Градиент 1"></div>
            <div class="bg-preset" style="background:linear-gradient(135deg,#1f1c2c,#928dab)" data-bg-idx="grad2" title="Градиент 2"></div>
          </div>
          <div class="column-color-row" style="margin-top:10px">
            <label style="margin:0">Свой цвет</label>
            <input type="color" id="bg-custom" value="${s.type==='color' ? (s.value || '#1e2a3a') : '#1e2a3a'}">
            <button class="btn" id="bg-apply">Применить</button>
          </div>
          <label>Фоновое изображение</label>
          <input type="file" id="bg-image-input" accept="image/*">
          <div class="bg-preview"><div class="hint">Загрузите изображение для фона</div></div>
          <div class="slider-row"><label>Размытие</label><input type="range" id="bg-blur" min="0" max="20" value="${s.blur || 0}"><span id="bg-blur-v">${s.blur || 0}px</span></div>
          <div class="slider-row"><label>Затемнение</label><input type="range" id="bg-darken" min="0" max="80" value="${s.darken || 0}"><span id="bg-darken-v">${s.darken || 0}%</span></div>
          <div class="slider-row"><label><input type="checkbox" id="bg-adapt" ${(s.adapt === false) ? '' : 'checked'}> Подбирать цвета под фон</label></div>
        </div>
        <div class="tab-pane" id="pane-ui">
          <label>Масштаб UI</label>
          <div class="slider-row">
            <input type="range" id="ui-scale" min="0.4" max="2.0" step="0.1" value="1.0">
            <span id="ui-scale-v">100%</span>
          </div>
          <button class="btn" id="ui-scale-reset">Сброс</button>
          <div class="hint">Устанавливает общий масштаб интерфейса. Сохраняется между перезагрузками.</div>

          <label>Цветовая тема</label>
          <select id="theme-mode">
            <option value="auto">Авто (по времени суток)</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
          <div class="hint">Авто переключается в зависимости от часа. Светлая/тёмная принудительные.</div>

          <label><input type="checkbox" id="shaders-toggle"> Включить лёгкие шейдеры</label>
          <div class="hint">Бесшумные фоновые эффекты с минимальной нагрузкой. Отключите если возникают просадки FPS.</div>
        </div>
        <div class="tab-pane" id="pane-ai">
          <label>Движок</label>
          <select id="ai-mode-in">
            <option value="cli" ${APP.db._aiMode === 'api' ? '' : 'selected'}>opencode CLI (Биг Пикл)</option>
            <option value="api" ${APP.db._aiMode === 'api' ? 'selected' : ''}>Локальная модель (Ollama / OpenAI-совместимый API)</option>
          </select>
          <div class="hint">opencode CLI — как в самом opencode. Ollama — локально, без сети (нужен установленный ollama и скачанная модель).</div>
          <label>Base URL (для API-режима)</label><input type="text" id="ai-base" value="${this.esc(APP.db._aiBase || '')}" placeholder="http://127.0.0.1:11434/v1">
          <label>API-ключ (для API-режима; можно оставить пустым у Ollama)</label><input type="password" id="ai-apikey" value="${this.esc(APP.db._aiKey || '')}" placeholder="sk-…">
          <label>Путь к opencode (пусто = авто-поиск)</label><input type="text" id="ai-bin" value="${this.esc(APP.db._aiBin || '')}" placeholder="~/.opencode/bin/opencode">
          <label>Рабочая папка проектов</label><input type="text" id="ai-projects" value="${this.esc(APP.db._aiProjects || '')}" placeholder="~/AI Projects">
          <label>Модель</label><input type="text" id="ai-model-in" value="${this.esc(APP.db._aiModel || '')}" placeholder="opencode/big-pickle (или qwen2.5 для Ollama)">
          <label>Системный промпт</label><textarea id="ai-sys" rows="2">${this.esc(APP.db._aiSys || '')}</textarea>
          <button class="btn" id="ai-load-config" style="margin-top:10px">Загрузить текущие настройки</button>
          <div class="hint" id="ai-config-status"></div>
        </div>
        <div class="tab-pane" id="pane-panels">
          <div class="hint">Отметьте панели, которые должны быть видны на дашборде. Изменения применяются сразу и сохраняются на этом устройстве.</div>
          <div id="panels-list" class="panels-list"></div>
          <button class="btn" id="panels-show-all" style="margin-top:8px">Показать все</button>
        </div>
        <div class="tab-pane" id="pane-update">
          <div class="upd-box">
            <div id="upd-status" class="hint">Проверяю…</div>
            <div id="upd-meta" class="hint"></div>
            <div id="upd-commits" class="upd-commits"></div>
            <label>Ключ обновления (если задан)</label>
            <input type="password" id="upd-key" placeholder="KANBAN_UPDATE_KEY">
            <div class="upd-actions">
              <button class="btn" id="upd-check">⟳ Проверить</button>
              <button class="btn primary" id="upd-apply" disabled>Обновить и перезапустить</button>
            </div>
            <div id="upd-log" class="upd-log"></div>
          </div>
          <div class="hint">Обновление выполняет <code>git pull --ff-only</code> и перезапускает сервис. Незакоммиченные изменения в отслеживаемых файлах блокируют обновление. Desktop-версия обновляется вручную.</div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn primary" data-save-settings>Сохранить</button></div>
    `);

    document.getElementById('bg-apply').onclick = () => { this.db.settings.background = { type: 'color', value: document.getElementById('bg-custom').value, blur: +(document.getElementById('bg-blur').value), darken: +(document.getElementById('bg-darken').value), adapt: adaptNow() }; this.save(); this.applyBg(); };
    document.getElementById('bg-blur').oninput = (e) => document.getElementById('bg-blur-v').textContent = e.target.value + 'px';
    document.getElementById('bg-darken').oninput = (e) => document.getElementById('bg-darken-v').textContent = e.target.value + '%';
    const adaptNow = () => { const a = document.getElementById('bg-adapt'); return a ? a.checked : true; };
    document.getElementById('bg-adapt').onchange = () => { this.db.settings.background.adapt = adaptNow(); this.save(); this.applyBg(); };
    document.getElementById('bg-image-input').onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: reader.result }) });
          const { url } = await res.json();
          this.db.settings.background = { type: 'image', src: url, blur: +(document.getElementById('bg-blur').value), darken: +(document.getElementById('bg-darken').value), adapt: adaptNow() };
          this.save(); this.applyBg();
        } catch (e) { alert('Ошибка загрузки'); }
      };
      reader.readAsDataURL(file);
    };

    document.querySelectorAll('.bg-preset').forEach(p => {
      p.onclick = () => {
        document.querySelectorAll('.bg-preset').forEach(x => x.classList.remove('sel'));
        p.classList.add('sel');
        const idx = p.dataset.bgIdx;
        if (idx === 'custom') this.db.settings.background = { type: 'color', value: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', blur: 0, darken: 0, special: true, adapt: adaptNow() };
        else if (idx === 'grad2') this.db.settings.background = { type: 'color', value: 'linear-gradient(135deg,#1f1c2c,#928dab)', blur: 0, darken: 0, special: true, adapt: adaptNow() };
        else { this.db.settings.background = { type: 'color', value: gradients[idx].value, blur: 0, darken: 0, adapt: adaptNow() }; }
        this.save(); this.applyBg();
      };
    });

    this.fetchAiConfig();
    this.renderPanelSettings();
    const updateTab = document.querySelector('.tab[data-tab="update"]');
    if (updateTab) updateTab.addEventListener('click', () => this.initUpdateSettings(), { once: true });

    document.getElementById('ai-load-config').onclick = async () => { await this.fetchAiConfig(); };
    document.querySelector('[data-save-settings]').onclick = async () => {
      const blur = +(document.getElementById('bg-blur').value);
      const darken = +(document.getElementById('bg-darken').value);
      if (this.db.settings.background) { this.db.settings.background.blur = blur; this.db.settings.background.darken = darken; }
      this.applyBg();

      const payload = {
        ai: {
          mode: document.getElementById('ai-mode-in').value,
          baseUrl: document.getElementById('ai-base').value.trim(),
          apiKey: document.getElementById('ai-apikey').value.trim(),
          opencodeBin: document.getElementById('ai-bin').value.trim(),
          projectsDir: document.getElementById('ai-projects').value.trim(),
          model: document.getElementById('ai-model-in').value.trim(),
          systemPrompt: document.getElementById('ai-sys').value.trim()
        }
      };
      try {
        const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const r = await res.json();
        document.getElementById('ai-config-status').textContent = r.ok ? '✅ Сохранено' : '❌ Ошибка';
        setTimeout(() => { const st = document.getElementById('ai-config-status'); if (st) st.textContent = ''; }, 4000);
      } catch (e) { document.getElementById('ai-config-status').textContent = '❌ Ошибка сети'; }
      this.save(); this.closeModal();
    };

    const modeSel = document.getElementById('theme-mode');
    if (modeSel && window.THEME) {
      modeSel.value = (window.THEME.getMode && window.THEME.getMode()) || 'auto';
      modeSel.onchange = () => { if (window.THEME.setMode) window.THEME.setMode(modeSel.value); };
    }

    const uiScale = document.getElementById('ui-scale');
    const uiScaleV = document.getElementById('ui-scale-v');
    const uiScaleReset = document.getElementById('ui-scale-reset');
    const curS = window.CANVAS && window.CANVAS.view ? window.CANVAS.view().s : 1;
    if (uiScale) {
      uiScale.value = String(curS);
      if (uiScaleV) uiScaleV.textContent = Math.round(curS * 100) + '%';
      uiScale.oninput = () => {
        const s = parseFloat(uiScale.value);
        if (uiScaleV) uiScaleV.textContent = Math.round(s * 100) + '%';
        if (window.CANVAS && window.CANVAS.scaleAtCenter) window.CANVAS.scaleAtCenter(s);
        else if (window.CANVAS && window.CANVAS.zoomAt) {
          const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
          window.CANVAS.zoomAt(cx, cy, s / (window.CANVAS.view ? window.CANVAS.view().s : 1));
        }
      };
    }
    if (uiScaleReset) {
      uiScaleReset.onclick = () => {
        if (window.CANVAS && window.CANVAS.reset) window.CANVAS.reset();
        if (uiScale) uiScale.value = '1.0';
        if (uiScaleV) uiScaleV.textContent = '100%';
      };
    }

    const shadersT = document.getElementById('shaders-toggle');
    const SHAD_KEY = 'nb-shaders';
    if (shadersT) {
      try { shadersT.checked = (localStorage.getItem(SHAD_KEY) || '0') === '1'; } catch (e) {}
      shadersT.onchange = () => {
        try { localStorage.setItem(SHAD_KEY, shadersT.checked ? '1' : '0'); } catch (e) {}
        if (window.BGSHADER) window.BGSHADER.toggle(shadersT.checked);
        else { document.documentElement.dataset.shaders = shadersT.checked ? '1' : '0'; }
      };
    }

    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('pane-' + t.dataset.tab).classList.add('active');
      };
    });
  },
  renderPanelSettings() {
    const list = document.getElementById('panels-list');
    if (!list || !window.PANELS) return;
    const hidden = new Set(window.PANELS.getHidden());
    list.innerHTML = window.PANELS.defs.map(p =>
      `<label class="panel-toggle"><input type="checkbox" data-panel="${p.key}" ${hidden.has(p.key) ? '' : 'checked'}> <span>${p.label}</span></label>`
    ).join('');
    const sync = () => {
      const off = Array.from(list.querySelectorAll('input[data-panel]')).filter(x => !x.checked).map(x => x.dataset.panel);
      window.PANELS.setHidden(off);
    };
    list.querySelectorAll('input[data-panel]').forEach(cb => { cb.onchange = sync; });
    const all = document.getElementById('panels-show-all');
    if (all) all.onclick = () => {
      list.querySelectorAll('input[data-panel]').forEach(x => { x.checked = true; });
      window.PANELS.setHidden([]);
    };
  },

  initUpdateSettings() {
    const status = document.getElementById('upd-status');
    const meta = document.getElementById('upd-meta');
    const commits = document.getElementById('upd-commits');
    const apply = document.getElementById('upd-apply');
    const check = document.getElementById('upd-check');
    const log = document.getElementById('upd-log');
    const keyIn = document.getElementById('upd-key');
    if (!status || !apply || !check) return;
    let last = null;
    try { if (keyIn) keyIn.value = localStorage.getItem('kban-update-key') || ''; } catch (e) {}
    const headers = () => {
      const h = {};
      const k = keyIn ? keyIn.value.trim() : '';
      if (k) h['x-update-key'] = k;
      return h;
    };
    if (keyIn) keyIn.onchange = () => {
      try { localStorage.setItem('kban-update-key', keyIn.value.trim()); } catch (e) {}
    };
    const short = h => String(h || '').slice(0, 10);
    const setLog = t => { if (log) log.textContent = t || ''; };
    const render = d => {
      last = d;
      if (!d || !d.ok) { status.textContent = 'Ошибка: ' + ((d && d.error) || 'нет ответа'); apply.disabled = true; return; }
      if (!d.supported) {
        status.textContent = 'Обновления недоступны: ' + (d.reason || 'не git-репозиторий');
        meta.textContent = '';
        commits.innerHTML = '';
        apply.disabled = true;
        return;
      }
      const behind = d.behind || 0;
      status.textContent = behind ? ('Доступно обновлений: ' + behind) : (d.ahead ? 'Локальные коммиты впереди' : 'Обновлений нет');
      meta.textContent = 'Ветка ' + d.branch + ' · ' + short(d.current) + ' → ' + short(d.latest) + (d.fetchError ? ' · ' + d.fetchError : '');
      commits.innerHTML = (d.commits || []).map(c =>
        `<div class="upd-commit"><code>${c.hash}</code><span>${this.esc(c.subject)}</span><span class="hint">${this.esc(c.author)} · ${this.esc(c.when)}</span></div>`
      ).join('');
      if ((d.dirty || []).length) status.textContent += ' · есть незакоммиченные изменения';
      apply.disabled = !(behind > 0) || (d.dirty || []).length > 0;
    };
    const doCheck = async (refresh) => {
      status.textContent = 'Проверяю…';
      setLog('');
      try {
        const r = await fetch('/api/update/check' + (refresh ? '' : '?refresh=0'), { headers: headers(), cache: 'no-store' });
        const d = await r.json();
        render(d);
      } catch (e) {
        status.textContent = 'Ошибка проверки: ' + String((e && e.message) || e);
        apply.disabled = true;
      }
    };
    check.onclick = () => doCheck(true);
    apply.onclick = async () => {
      if (!last || !last.supported) return;
      apply.disabled = true;
      check.disabled = true;
      setLog('Выполняю git pull…');
      status.textContent = 'Обновляю…';
      try {
        const r = await fetch('/api/update/apply', { method: 'POST', headers: headers() });
        const d = await r.json();
        if (!d.ok) {
          status.textContent = 'Ошибка: ' + (d.error || 'не удалось обновить');
          setLog(JSON.stringify(d, null, 2));
          apply.disabled = false;
          check.disabled = false;
          return;
        }
        setLog((d.output || '') + '\n\n' + (d.restart ? 'Перезапускаю сервис…' : (d.restartNote || 'Перезапустите сервис вручную.')));
        status.textContent = 'Обновлено, жду перезапуск…';
        if (d.restart) {
          let tries = 0;
          const t = setInterval(async () => {
            tries++;
            try {
              const p = await fetch('/api/ping', { cache: 'no-store' });
              if (p.ok) { clearInterval(t); location.reload(); return; }
            } catch (e) {}
            if (tries > 40) { clearInterval(t); status.textContent = 'Сервис не ответил — проверьте kanban-board'; }
          }, 1000);
        } else {
          check.disabled = false;
          apply.disabled = false;
        }
      } catch (e) {
        status.textContent = 'Ошибка сети: ' + String((e && e.message) || e);
        setLog('');
        check.disabled = false;
        apply.disabled = false;
      }
    };
    doCheck(true);
  },

  async fetchAiConfig() {
    try {
      const res = await fetch('/api/config');
      const c = await res.json();
      this.db._aiMode = c.ai && c.ai.mode || 'cli';
      this.db._aiBase = c.ai && c.ai.baseUrl || '';
      this.db._aiKey = c.ai && c.ai.apiKey || '';
      this.db._aiBin = c.ai && c.ai.opencodeBin || '';
      this.db._aiProjects = c.ai && c.ai.projectsDir || '';
      this.db._aiModel = c.ai && c.ai.model || '';
      this.db._aiSys = c.ai && c.ai.systemPrompt || '';
      /* Поля формы строятся из кэша db до ответа сервера — заполняем их здесь,
         иначе «Сохранить» затирает серверный конфиг пустыми значениями. */
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? '' : val; };
      const mode = document.getElementById('ai-mode-in');
      if (mode) mode.value = (c.ai && c.ai.mode) || 'cli';
      set('ai-base', c.ai && c.ai.baseUrl);
      set('ai-apikey', '');
      if (c.hasApiKey) {
        const k = document.getElementById('ai-apikey');
        if (k) k.placeholder = '••••••  (ключ сохранён — оставьте пустым, чтобы не менять)';
      }
      set('ai-bin', c.ai && c.ai.opencodeBin);
      set('ai-projects', c.ai && c.ai.projectsDir);
      set('ai-model-in', c.ai && c.ai.model);
      set('ai-sys', c.ai && c.ai.systemPrompt);
      const e = document.getElementById('ai-config-status');
      if (e) e.textContent = 'Загружено из сервера ✓';
    } catch (e) {}
  },

  /* ---- Руководство по использованию доски ---- */
  openGuide() {
    this.openModal(`
      <div class="modal-head"><h3>❓ Справка: что умеет доска и как этим пользоваться</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body guide-body">
        <p class="guide-lead">Это ваша <b>личная доска на собственном компьютере</b>. Всё хранится только у вас — интернет нужен лишь для фильмов, новостей, музыки и ИИ. Открывается в браузере, работает и на телефоне. Этот текст написан простым языком — технические детали в конце.</p>

        <details>
          <summary>🔓 Как открыть доску</summary>
          <ul>
            <li><b>На этом компьютере:</b> в адресной строке браузера наберите <code>http://localhost:8080</code></li>
            <li><b>С телефона или планшета</b> (в той же Wi-Fi сети): <code>http://192.168.1.100:8080</code> — адрес своего ПК можно посмотреть в настройках Wi-Fi.</li>
            <li>Совет: добавьте страницу на главный экран телефона — откроется как приложение.</li>
            <li>Если включён «безопасный режим» (https), адрес начинается с <code>https://</code> и браузер один раз спросит про сертификат — нажмите «Дополнительно» → «Перейти».</li>
          </ul>
        </details>

        <details open>
          <summary>📲 Уведомления с телефона на доску (главное!)</summary>
          <p class="g-note">Когда звонит будильник, приходит сообщение или письмо — это уведомление можно показывать прямо на доске. Понадобится установить на телефон небольшую программу-«пересылщик» (Android).</p>
          <p><b>Способ 1. Вручную (быстро проверить).</b> Откройте на телефоне страницу <code>http://192.168.1.100:8080/notify.html</code>, заполните заголовок и текст, нажмите «Отправить» — на доске всплывёт уведомление.</p>
          <p><b>Способ 2. Автоматически (рекомендую).</b> Поставьте любое приложение, которое умеет «на получение уведомления выполнить веб-запрос». Самые простые бесплатные: <b>HTTP Shortcuts</b>, <b>MacroDroid</b>, <b>Tasker</b>, <b>Notification Forwarder</b>.</p>
          <ol>
            <li>Создайте новое действие/ярлык с типом <b>«HTTP Request» (веб-запрос)</b>.</li>
            <li>Метод — <b>POST</b>, адрес:<br><code>http://192.168.1.100:8080/api/notify/send</code></li>
            <li>Заголовок (header): <code>Content-Type: application/json</code></li>
            <li>Тело (body) — такой текст, где в кавычки подставьте данные уведомления:
              <pre>{
  "title": "Заголовок уведомления",
  "text":  "Текст уведомления",
  "app":   "Название приложения",
  "chat":  "Чат или собеседник"
}</pre>
              Поля: <code>title</code> — заголовок, <code>text</code> — текст, <code>app</code> — приложение (для статистики), <code>chat</code> — чат/собеседник (для статистики). Достаточно одного <code>title</code> или <code>text</code>.</li>
            <li>В приложении-пересылщике включите пересылку для нужных приложений (мессенджеры, звонки, будильник) и разрешите ему доступ к уведомлениям.</li>
          </ol>
          <ul>
            <li>Уведомления появятся <b>всплывающим окном на доске</b> и попадут во вкладку <b>🔔</b> (история).</li>
            <li>Уведомление видно, только когда в браузере открыта вкладка доски.</li>
            <li>Один и тот же текст повторов подряд не дублируется (защита от «спама»).</li>
          </ul>
          <p class="g-note">🔐 Если на сервере задан «ключ уведомлений», добавьте в запрос заголовок <code>x-notify-key: ВАШ_КЛЮЧ</code> (или допишите <code>?key=ВАШ_КЛЮЧ</code> к адресу). Спросите у того, кто настраивал сервер, или оставьте как есть — по умолчанию ключ не требуется.</p>
        </details>

        <details>
          <summary>🔔 Уведомления и звуки</summary>
          <ul>
            <li>Кнопка <b>🔔</b> вверху — история уведомлений (с телефона и системных).</li>
            <li>Вкладка <b>🔊 Звуки</b> — выбор звука уведомления: есть готовые примеры (звонкий, мягкий, колокольчик, сообщение, поп, капля, успех, внимание, срочно, арпеджио).</li>
            <li>Здесь же можно <b>загрузить свой звук</b> с компьютера (mp3, wav, ogg, m4a — до 12 МБ), прослушать его и выбрать по умолчанию.</li>
            <li>Ползунок «Громкость» и <b>правила</b>: например, для приложения «Телеграм» — один звук, для «Календаря» — другой.</li>
          </ul>
        </details>

        <details>
          <summary>📋 Доска: колонки и карточки</summary>
          <ul>
            <li><b>+ Колонка</b> — новая колонка (например «В работе», «Готово»). Кнопка <b>⋯</b> на колонке — переименовать, сменить цвет, удалить.</li>
            <li><b>+ Карточка</b> в колонке — новая задача. Клик по карточке — редактировать.</li>
            <li>В карточке: заголовок, текст, приоритет (важно/средне/низко), напоминание (наступит — придёт уведомление).</li>
            <li><b>Перетаскивание:</b> удерживайте карточку мышью и перетащите в другую колонку. На тач-экране — удерживайте палец ~0,5 с и отпустите в нужной колонке.</li>
            <li>Карточки можно сворачивать, а двойной клик — быстрый предпросмотр.</li>
          </ul>
        </details>

        <details>
          <summary>🧭 Два вида: Дашборд и Канбан</summary>
          <ul>
            <li><b>Дашборд</b> — обзорный экран с плитками (погода, статистика, файлы, звуки и др.).</li>
            <li><b>Канбан</b> — классическая доска с колонками и карточками.</li>
            <li>Переключатель видов — в верхней панели. Ненужные блоки на дашборде можно сворачивать.</li>
          </ul>
        </details>

        <details>
          <summary>🧩 Панели и окна на доске</summary>
          <ul>
            <li>Панели можно «вынести» прямо на доску через каталог <b>🧩</b> (клик или перетаскивание).</li>
            <li>Тяните панель за заголовок, растягивайте за угол или края.</li>
            <li>Кнопка <b>🧹</b> аккуратно раскладывает все окна по сетке одним нажатием, не закрывая карточки.</li>
          </ul>
        </details>

        <details>
          <summary>🎬 Вечер · 🗞 Новости · 🎵 Музыка</summary>
          <ul>
            <li><b>🎬 Вечер</b> — что посмотреть: список фильмов с постерами, кнопки «смотреть», перелистывание ◀▶, перемешать 🔀, отметить просмотренным, добавить свой фильм.</li>
            <li><b>🗞 Новости</b> — сводка за сегодня/вчера из нескольких источников. Оценивайте новости 😞…🤩 — лента подстраивается под ваши интересы. Кнопка ✨ — краткая сводка от ИИ.</li>
            <li><b>🎵 Музыка</b> — плеер музыки с вашего ПК (папка «Музыка»): ⏮ ▶ ⏭ 🔀, можно загружать свои треки.</li>
          </ul>
        </details>

        <details>
          <summary>▶ YouTube · 🎮 Игры · 🏠 Умный дом · 🧠 Интересы</summary>
          <ul>
            <li><b>▶ YouTube</b> — поиск видео, просмотр прямо на доске, история и подборки по интересам.</li>
            <li><b>🎮 Игры</b> — библиотека Steam и ваши игры: постеры, обновление списка, поиск в каталоге.</li>
            <li><b>🏠 Умный дом</b> — сканирование домашней сети, список устройств, сценарии (например «утро»), поддержка Яндекс Станции.</li>
            <li><b>🧠 Интересы</b> — «портрет» ваших интересов, построенный по просмотрам и запросам; можно импортировать данные из браузера.</li>
          </ul>
        </details>

        <details>
          <summary>📨 Статистика · 🐙 GitHub · 🖥 Консоль · 🌧 Погода</summary>
          <ul>
            <li><b>📨 Статистика сообщений</b> — сколько уведомлений пришло, сколько активных дней, в среднем в день.</li>
            <li><b>🐙 GitHub</b> — ваши репозитории и последние действия.</li>
            <li><b>🖥 Консоль</b> — серверные операции (для продвинутых).</li>
            <li><b>🌧 Погода</b> — клик по погоде вверху: почасовая раскладка и карта осадков (Москва).</li>
          </ul>
        </details>

        <details>
          <summary>🤖 ИИ-ассистент</summary>
          <ul>
            <li>Кнопка <b>🤖</b> — ассистент: отвечает в чате, может говорить вслух, ставить напоминания, запоминать факты.</li>
            <li>Его можно попросить добавить карточку или записать что-то в память простой фразой.</li>
            <li class="g-note">🎙 Голосовое управление по слову-обращению (микрофон 🎤) пока <b>временно отключено</b>. Голосовой ввод в чате с ассистентом работает.</li>
          </ul>
        </details>

        <details>
          <summary>⚙️ Настройки и зум</summary>
          <ul>
            <li><b>⚙️ Настройки</b> — тема (светлая/тёмная), фон (цвет, градиент, изображение, размытие, затемнение), параметры ИИ.</li>
            <li><b>🔍 Масштаб интерфейса</b> — удерживайте <code>Ctrl</code> (или ⌘) и крутите колесо мыши; сброс — <code>Ctrl+0</code>. Кнопки <b>− / 1:1 / +</b> — в верхней панели.</li>
            <li>Переключение светлой/тёмной темы — кнопка <b>◑</b> вверху.</li>
          </ul>
        </details>

        <details>
          <summary>🔐 Безопасность (коротко)</summary>
          <ul>
            <li>Доска работает в вашей домашней сети. Данные хранятся на вашем компьютере.</li>
            <li>Если доска доступна другим — уточните пароль и «ключ уведомлений» у того, кто её настраивал.</li>
            <li>Никому не передавайте секретные файлы из папки настроек.</li>
          </ul>
        </details>
      </div>
      <div class="modal-foot"><button class="btn primary" data-close-guide>Понятно</button></div>
    `);
    const g = document.querySelector('[data-close-guide]');
    if (g) g.onclick = () => this.closeModal();
    const card = document.querySelector('#modal .modal-card');
    if (card) card.classList.add('guide-modal');
  },

  /* ---- Modal helpers ---- */
  openModal(html) {
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('modal').innerHTML = `<div class="overlay" data-close-overlay style="position:fixed;inset:0;z-index:-1"></div><div class="modal-card">${html}</div>`;
    document.getElementById('modal').querySelector('[data-close-overlay]').onclick = () => this.closeModal();
    document.getElementById('modal').querySelector('[data-close-modal]')?.addEventListener('click', () => this.closeModal());
  },
  closeModal() { document.getElementById('modal').classList.add('hidden'); document.getElementById('modal').innerHTML = ''; },

  /* ---- Drawers ---- */
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  /* clientX и innerWidth — визуальные пиксели, --ai-w живёт в layout */
  aiPanelWidth(clientX) {
    const z = window.CANVAS && window.CANVAS.scale ? window.CANVAS.scale() : 1;
    return this.clamp((window.innerWidth - clientX) / z, 260, 640);
  },
  initResizer() {
    const rz = document.getElementById('ai-resizer');
    if (!rz) return;
    const root = document.documentElement;
    const saved = parseInt(localStorage.getItem('aiPanelWidth') || '', 10);
    if (saved) root.style.setProperty('--ai-w', this.clamp(saved, 260, 640) + 'px');
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      root.style.setProperty('--ai-w', this.aiPanelWidth(e.clientX) + 'px');
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (e && typeof e.clientX === 'number') localStorage.setItem('aiPanelWidth', String(this.aiPanelWidth(e.clientX)));
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
    rz.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      try { rz.setPointerCapture(e.pointerId); } catch (err) {}
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  },

  /* ---- Drawers ---- */
  openDrawer(id) {
    document.getElementById(id + '-panel').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
  },
  closeAll() {
    ['events', 'files'].forEach(id => document.getElementById(id + '-panel')?.classList.add('hidden'));
    document.getElementById('overlay').classList.add('hidden');
  },
  close(id) {
    document.getElementById(id + '-panel')?.classList.add('hidden');
    if (!document.querySelector('.drawer:not(.hidden)')) document.getElementById('overlay').classList.add('hidden');
  },

  /* ---- Toast ---- */
  toast(title, msg, warn = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (warn ? ' warn' : '');
    t.innerHTML = `<div class="toast-title">${this.esc(title)}</div>${msg ? `<div class="toast-msg">${this.esc(msg)}</div>` : ''}`;
    document.getElementById('event-toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 400); }, 7000);
  },

  /* ---- System notification ---- */
  notifySystem(title, body) {
    if (Notification.permission === 'granted') new Notification(title, { body, icon: '📋' });
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  },

  /* ---- Drag & Drop (mouse) ---- */
  initDragTouch() {
    const board = document.getElementById('board-inner');
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const colBody = e.target.closest('.col-body');
      if (colBody) { colBody.querySelectorAll('.drop-hint').forEach(x => x.classList.remove('drop-hint')); const card = e.target.closest('.card'); if (card) card.classList.add('drop-hint'); }
    });
    board.addEventListener('dragleave', (e) => { e.target.closest('.card')?.classList.remove('drop-hint'); });
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      board.querySelectorAll('.drop-hint').forEach(x => x.classList.remove('drop-hint'));
      const cardId = e.dataTransfer.getData('text/plain');
      const colBody = e.target.closest('.col-body');
      if (!cardId || !colBody) return;
      const colId = colBody.dataset.col;
      const card = this.db.board.cards.find(c => c.id === cardId);
      if (card) { card.columnId = colId; this.save(); this.render(); }
    });

    /* Touch: long-press then tap to move */
    let touchCard = null;
    let touchTimer = null;
    document.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) { touchCard = null; return; }
      touchTimer = setTimeout(() => {
        touchCard = card.dataset.card;
        card.style.outline = '2px solid var(--accent)';
      }, 450);
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      clearTimeout(touchTimer);
      if (!touchCard) return;
      const card = document.querySelector(`.card[data-card="${touchCard}"]`);
      if (card) card.style.outline = '';
      /* target у touchend — элемент touchstart (карточка), а не точка отпускания;
         колонку ищем под пальцем. */
      const t0 = e.changedTouches && e.changedTouches[0];
      const el = t0 ? document.elementFromPoint(t0.clientX, t0.clientY) : null;
      const colBody = el && el.closest ? el.closest('.col-body') : null;
      if (colBody) {
        const colId = colBody.dataset.col;
        const c = this.db.board.cards.find(c => c.id === touchCard);
        if (c) { c.columnId = colId; this.save(); this.render(); this.toast('Карточка перемещена'); }
      }
      touchCard = null;
    }, { passive: true });

    document.getElementById('btn-events').onclick = () => this.openEvents();
    document.getElementById('btn-ai-toggle').onclick = () => {
      const p = document.getElementById('ai-panel');
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden') && window.AI_INIT) window.AI_INIT();
    };
  },

  /* ---- Utilities ---- */
  esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
};

document.addEventListener('DOMContentLoaded', () => APP.init());
