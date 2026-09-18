'use strict';

(function () {
  let list = [];
  let busyposter = 0;
  let idx = 0;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  window.WIDGET = window.WIDGET || {
    tab(name) {
      document.querySelectorAll('.sw-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.sw-pane').forEach(p => p.classList.add('hidden'));
      const pane = $('sw-' + name);
      if (pane) pane.classList.remove('hidden');
      if (name === 'news' && window.NEWSBTN) window.NEWSBTN.load();
      if (name === 'movies') load();
    },
    minim() {
      const w = $('side-widget');
      w.classList.toggle('mini');
      $('sw-toggle').textContent = w.classList.contains('mini') ? '+' : '–';
    }
  };

  async function load() {
    try {
      const r = await fetch('/api/movies');
      if (r.ok) {
        list = (await r.json()).movies || [];
        list = shuffle(list);
      }
    } catch (e) { list = list || []; }
    if (idx >= list.length) idx = 0;
    render();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function render() {
    const box = $('sw-movies');
    if (!list.length) {
      box.innerHTML = '<div class="sw-add"><input id="mv-add" placeholder="Добавить фильм / сериал…"><button id="mv-add-btn">+</button></div><div class="empty-state">Пока пусто — добавьте фильм</div>';
      bindAdd();
      return;
    }
    if (idx >= list.length) idx = list.length - 1;
    const m = list[idx];
    const withPoster = list.filter(x => x.poster).length;
    box.innerHTML = `
      <div class="sw-add"><input id="mv-add" placeholder="Добавить фильм / сериал…"><button id="mv-add-btn">+</button></div>
      ${withPoster < list.length ? `<button class="mv-resolve-all" id="mv-resolve-all">🖼 Найти постеры (${list.length - withPoster})</button>` : ''}
      <div class="mv-flip">
        <button class="mv-arrow" id="mv-prev" title="Назад" ${list.length < 2 ? 'disabled' : ''}>◀</button>
        <div class="mv-frame">${mvCard(m)}</div>
        <button class="mv-arrow" id="mv-next" title="Далее" ${list.length < 2 ? 'disabled' : ''}>▶</button>
      </div>
      <div class="mv-dots">${list.map((x, i) => `<span class="mv-dot${i === idx ? ' on' : ''}"></span>`).join('')}</div>
      <div class="mv-pos"><button class="mv-btn" id="mv-shuffle" title="Перемешать">🔀</button><span class="mv-idx">${idx + 1} / ${list.length}</span></div>`;
    bindAdd();
    const it = document.querySelector('.mv-item');
    if (it) {
      const id = it.dataset.id;
      it.querySelector('[data-mv-watch]').onclick = (e) => { e.stopPropagation(); toggle(id, m); };
      it.querySelector('[data-mv-del]').onclick = (e) => { e.stopPropagation(); del(id); };
      const rbtn = it.querySelector('[data-mv-resolve]');
      if (rbtn) rbtn.onclick = (e) => { e.stopPropagation(); resolveOne(id); };
      it.onclick = () => openDetail(id);
      const img = it.querySelector('.mv-post[data-ph]');
      if (img) img.onerror = () => {
        const ph = String(img.dataset.ph || '?');
        img.replaceWith((() => { const d = document.createElement('div'); d.className = 'mv-post mv-ph'; d.textContent = ph; return d; })());
      };
    }
    $('mv-prev').onclick = () => { idx = (idx - 1 + list.length) % list.length; render(); };
    $('mv-next').onclick = () => { idx = (idx + 1) % list.length; render(); };
    $('mv-shuffle').onclick = () => { idx = Math.floor(Math.random() * list.length); render(); };
    const ra = box.querySelector('#mv-resolve-all');
    if (ra) ra.onclick = () => resolveAll();
  }

  function mvCard(m) {
    const ph = esc(String(m.title || '?').charAt(0).toUpperCase());
    return `<div class="mv-item ${m.watched ? 'watched' : ''}" data-id="${m.id}">
      ${m.poster
        ? `<img class="mv-post" data-ph="${ph}" src="${m.poster}" loading="lazy" alt="">`
        : `<div class="mv-post mv-ph" title="Нажмите, чтобы открыть">${ph}</div>`}
      <div class="mv-body">
        <div class="mv-title">${esc(m.title)}</div>
        <div class="mv-act">${m.poster ? '' : '<button class="mv-btn" data-mv-resolve title="Найти постер">🖼</button>'}
          <button class="mv-btn" data-mv-watch title="${m.poster ? 'Детали и просмотр' : 'Просмотрено'}">${m.poster ? '👁' : '☑'}</button>
          <button class="mv-btn danger" data-mv-del title="Удалить">✕</button>
        </div>
      </div>
    </div>`;
  }

  function bindAdd() {
    const inp = $('mv-add'); if (!inp) return;
    const add = async () => {
      const t = inp.value.trim();
      if (!t) return;
      inp.value = '';
      try {
        await fetch('/api/movies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
        await load();
        setTimeout(() => $('sw-movies').querySelector('[data-mv-resolve]') && resolveAll(), 300);
      } catch (e) {}
    };
    $('mv-add-btn').onclick = add;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  async function toggle(id, m) {
    try { await fetch('/api/movies/' + id + '/toggle', { method: 'POST' }); await load(); } catch (e) {}
  }
  async function del(id) {
    if (!confirm('Удалить «' + ((list.find(x => x.id === id) || {}).title || '') + '»?')) return;
    try { await fetch('/api/movies/' + id + '/delete', { method: 'POST' }); await load(); } catch (e) {}
  }
  async function resolveOne(id) {
    try {
      const r = await fetch('/api/movies/' + id + '/resolve', { method: 'POST' });
      const d = await r.json();
      if (d && d.queued) { busyposter++; setTimeout(async () => { busyposter--; await load(); }, 9000); }
    } catch (e) {}
  }
  async function resolveAll() {
    const need = list.filter(m => !m.poster);
    if (!need.length) return;
    const btn = $('mv-resolve-all');
    if (btn) btn.disabled = true;
    const t0 = Date.now();
    for (let i = 0; i < need.length; i++) {
      const m = need[i];
      if (btn) btn.textContent = `🖼 Постеры ${i + 1}/${need.length}…`;
      await fetch('/api/movies/' + m.id + '/resolve', { method: 'POST' }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
      if (Date.now() - t0 > 600000) break;
    }
    await load();
    if (btn) btn.textContent = '🖼 Готово ✓';
    setTimeout(() => { if (btn) btn.remove(); }, 2500);
  }

  function openDetail(id) {
    const m = list.find(x => x.id === id);
    if (!m) return;
    const links = (m.links || []).map(l => `<a class="btn primary" target="_blank" rel="noopener" href="${l.url}">${esc(l.site)} ↗</a>`).join('');
    window.APP.openModal(`
      <div class="modal-head"><h3>${esc(m.title)}</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body mv-detail">
        ${m.poster
          ? `<div class="mv-full"><img src="${m.poster}" alt="${esc(m.title)}" onclick="this.classList.toggle('big')"><div class="hint">клик по постеру — увеличить/уменьшить</div></div>`
          : `<div class="empty-state">Постер ещё не найден<br><button class="btn" id="mv-d-resolve">🖼 Найти</button></div>`}
        <label>Смотреть:</label>
        <div class="mv-watch">${links}</div>
        <div class="mv-note">${m.watched ? '✅ Просмотрено' : '⏳ Не просмотрено'} ·
          <button class="btn" data-mv-watch2>Пометить ${m.watched ? 'непросмотренным' : 'просмотренным'}</button>
        </div>
      </div>`);
    const d = document.querySelector('[data-mv-watch2]');
    if (d) d.onclick = () => toggle(id, m);
    const dr = $('mv-d-resolve');
    if (dr) dr.onclick = async () => { await fetch('/api/movies/' + id + '/resolve', { method: 'POST' }); dr.textContent = '⏳ Ищем…'; dr.disabled = true; setTimeout(() => { try { window.APP.closeModal(); } catch (e) {} load(); }, 9000); };
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sw-tab').forEach(t => t.onclick = () => window.WIDGET.tab(t.dataset.tab));
    const togg = $('sw-toggle');
    if (togg) togg.onclick = () => window.WIDGET.minim();
    load();
  });

  window.MOVIES = { load, openDetail };
})();