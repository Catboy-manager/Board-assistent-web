'use strict';

window.APP = {
  db: null,
  opts: {},

  async init() {
    this.db = await this.fetchData();
    this.render();
    this.initClock();
    this.applyBg();
    this.initDragTouch();
    this.updateEventsBadge();
    setInterval(() => this.checkEvents(), 20000);

    document.getElementById('btn-settings').onclick = () => this.openSettings();
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
    try { await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.db) }); } catch (e) { console.error('save fail', e); }
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
  },

  /* ---- Render ---- */
  render() {
    const inner = document.getElementById('board-inner');
    inner.innerHTML = '';
    const { columns, cards } = this.db.board;
    columns.forEach(col => {
      const colCards = cards.filter(c => c.columnId === col.id);
      const div = document.createElement('div');
      div.className = 'column';
      div.dataset.col = col.id;
      div.style.setProperty('--col-color', col.color || '#888');
      div.innerHTML = `
        <div class="column-head">
          <span class="column-title">${this.esc(col.title)}</span>
          <span class="col-count">${colCards.length}</span>
          <button class="icon-btn col-menu" title="Меню колонки">⋯</button>
        </div>
        <div class="col-body" data-col="${col.id}"></div>
        <button class="add-card" data-col="${col.id}">+ Карточка</button>
      `;
      div.querySelector('.col-menu').onclick = () => this.openEditColumn(col);
      div.querySelector('.add-card').onclick = () => this.openAddCard(col.id);
      const body = div.querySelector('.col-body');
      colCards.forEach(card => body.appendChild(this.makeCard(card)));
      inner.appendChild(div);
    });
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
    const title = prompt('Название колонки:');
    if (!title) return;
    const colors = ['#f5b7b1','#aed6f1','#a9dfbf','#f9e79f','#d7bde2','#fadbd8'];
    this.db.board.columns.push({ id: 'col_' + Date.now().toString(36), title, color: colors[this.db.board.columns.length % colors.length] });
    this.save(); this.render();
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
    document.querySelector('[data-del-col]').onclick = () => { this.db.board.cards = this.db.board.cards.filter(c => c.columnId !== col.id); this.db.board.columns = this.db.board.columns.filter(c => c.id !== col.id); this.save(); this.render(); this.closeModal(); };
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
    if (!isNew) document.querySelector('[data-del-card]').onclick = () => { this.db.board.cards = this.db.board.cards.filter(c => c.id !== card.id); this.save(); this.render(); this.closeModal(); };
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
      b.onclick = () => { this.db.events = this.db.events.filter(e => e.id !== b.dataset.evDel); this.save(); this.renderEvents(); this.updateEventsBadge(); };
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
          <button class="tab" data-tab="ai">🤖 ИИ</button>
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
      </div>
      <div class="modal-foot"><button class="btn primary" data-save-settings>Сохранить</button></div>
    `);

    document.getElementById('bg-apply').onclick = () => { this.db.settings.background = { type: 'color', value: document.getElementById('bg-custom').value, blur: +(document.getElementById('bg-blur').value), darken: +(document.getElementById('bg-darken').value) }; this.save(); this.applyBg(); };
    document.getElementById('bg-blur').oninput = (e) => document.getElementById('bg-blur-v').textContent = e.target.value + 'px';
    document.getElementById('bg-darken').oninput = (e) => document.getElementById('bg-darken-v').textContent = e.target.value + '%';
    document.getElementById('bg-image-input').onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: reader.result }) });
          const { url } = await res.json();
          this.db.settings.background = { type: 'image', src: url, blur: +(document.getElementById('bg-blur').value), darken: +(document.getElementById('bg-darken').value) };
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
        if (idx === 'custom') this.db.settings.background = { type: 'color', value: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', blur: 0, darken: 0, special: true };
        else if (idx === 'grad2') this.db.settings.background = { type: 'color', value: 'linear-gradient(135deg,#1f1c2c,#928dab)', blur: 0, darken: 0, special: true };
        else { this.db.settings.background = { type: 'color', value: gradients[idx].value, blur: 0, darken: 0 }; }
        this.save(); this.applyBg();
      };
    });

    this.fetchAiConfig();

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

    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('pane-' + t.dataset.tab).classList.add('active');
      };
    });
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
      const e = document.getElementById('ai-config-status');
      if (e) e.textContent = 'Загружено из сервера ✓';
    } catch (e) {}
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
  initResizer() {
    const rz = document.getElementById('ai-resizer');
    if (!rz) return;
    const root = document.documentElement;
    const saved = parseInt(localStorage.getItem('aiPanelWidth') || '', 10);
    if (saved) root.style.setProperty('--ai-w', this.clamp(saved, 260, 640) + 'px');
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const w = this.clamp(window.innerWidth - e.clientX, 260, 640);
      root.style.setProperty('--ai-w', w + 'px');
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem('aiPanelWidth', String(this.clamp(window.innerWidth - e.clientX, 260, 640)));
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    rz.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      try { rz.setPointerCapture(e.pointerId); } catch (err) {}
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
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
      const colBody = e.target.closest('.col-body');
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
