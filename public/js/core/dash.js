'use strict';

/* NeuroBoard — дашборд: переключение вида, загрузка модулей,
   сворачивание карточек с сохранением состояния, сводка задач. */
(function () {
  const COLLAPSE_KEY = 'nb-collapsed';
  const VIEW_KEY = 'nb-view';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function readCollapse() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveCollapse(obj) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- Переключение представлений ---------- */
  function setView(view) {
    document.body.setAttribute('data-view', view);
    document.querySelectorAll('#view-switch .vs-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) {}
    if (view === 'board' && window.CANVAS && window.CANVAS.apply) {
      try { window.CANVAS.apply(); } catch (e) {}
    }
  }

  function initView() {
    const nav = $('view-switch');
    if (nav) {
      nav.querySelectorAll('.vs-btn').forEach(b => {
        b.onclick = () => setView(b.dataset.view);
      });
    }
    let v = 'dash';
    try { v = localStorage.getItem(VIEW_KEY) || 'dash'; } catch (e) {}
    setView(v);
    const openBtn = $('tasks-open-kanban');
    if (openBtn) openBtn.onclick = () => setView('board');
  }

  /* ---------- Сворачивание карточек ---------- */
  function cardKey(el) {
    return el.dataset.card || el.id || el.className;
  }

  function applyCollapsed(el, collapsed) {
    el.classList.toggle('collapsed', collapsed);
    const btn = el.querySelector('.dc-collapse, .sp-collapse');
    if (btn) btn.textContent = collapsed ? '▸' : '▾';
  }

  function wireCard(el, key, state) {
    if (!el) return;
    applyCollapsed(el, !!state[key]);
    const head = el.querySelector('.dash-card-head, .sp-head');
    if (!head || head.querySelector('.dc-collapse, .sp-collapse')) return;
    const btn = document.createElement('button');
    btn.className = el.classList.contains('side-panel') ? 'sp-collapse' : 'dc-collapse';
    btn.type = 'button';
    btn.title = 'Свернуть / развернуть';
    head.appendChild(btn);
    btn.onclick = () => {
      const next = !el.classList.contains('collapsed');
      state[key] = next;
      applyCollapsed(el, next);
      saveCollapse(state);
    };
  }

  function initCollapse() {
    const state = readCollapse();
    document.querySelectorAll('#dash .dash-card, #notif-col .dash-card, #dash .side-panel').forEach(el => {
      wireCard(el, cardKey(el), state);
    });
  }

  /* ---------- Загрузка модулей ---------- */
  function loadModules() {
    const calls = [
      ['MOVIES', 'load'], ['NEWSBTN', 'load'], ['MUSIC', 'load'],
      ['YT', 'load'], ['SMART', 'load'], ['GAMES', 'load'],
      ['MSGS', 'load'], ['STATS', 'load'], ['INT', 'load'],
      ['GHBTN', 'load'], ['OPS', 'load'],
      ['NOTIFY', 'loadHistory']
    ];
    calls.forEach(([ns, fn]) => {
      const o = window[ns];
      if (o && typeof o[fn] === 'function') {
        try { o[fn](); } catch (e) {}
      }
    });
    if (window.FILES && typeof window.FILES.load === 'function') {
      try { window.FILES.load(''); } catch (e) {}
    }
  }

  /* ---------- Сводка задач ---------- */
  function renderTasks() {
    const box = $('dash-tasks');
    if (!box) return;
    const db = window.APP && window.APP.db;
    if (!db || !db.board || !Array.isArray(db.board.columns)) {
      box.innerHTML = '<div class="tasks-empty">Загрузка…</div>';
      return;
    }
    const cols = db.board.columns;
    const cards = db.board.cards || [];
    if (!cols.length) {
      box.innerHTML = '<div class="tasks-empty">Колонок пока нет</div>';
      return;
    }
    box.innerHTML = cols.map(c => {
      const n = cards.filter(x => x.columnId === c.id).length;
      return `<div class="task-col" style="--col-color:${esc(c.color || '#ff6fb5')}">
        <span class="tc-title">${esc(c.title)}</span>
        <span class="tc-count">${n}</span>
      </div>`;
    }).join('') + `<button class="tasks-open" id="tasks-open-kanban">Открыть Канбан →</button>`;

    const btn = $('tasks-open-kanban');
    if (btn) btn.onclick = () => setView('board');
  }

  function hookTasks() {
    renderTasks();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (window.APP && window.APP.db) { renderTasks(); clearInterval(t); }
      else if (tries > 40) clearInterval(t);
    }, 250);
    const app = window.APP;
    if (app && !app._dashHooked) {
      const origRender = app.render.bind(app);
      app.render = function () { const r = origRender(); renderTasks(); return r; };
      app._dashHooked = true;
    } else if (!app) {
      setTimeout(hookTasks, 400);
    }
  }

  /* ---------- Видимость ИИ-панели и файлов в карточках ---------- */
  function revealPanels() {
    ['ai-panel', 'files-panel'].forEach(id => {
      const el = $(id);
      if (el) el.classList.remove('hidden');
    });
  }

  function init() {
    initView();
    revealPanels();
    initCollapse();
    loadModules();
    hookTasks();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.NEURO_DASH = { setView, reloadTasks: renderTasks };
})();
