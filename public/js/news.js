'use strict';

(function () {
  let period = 'today';
  let data = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const RATING_EMOJI = ['😞', '🙁', '😐', '🙂', '🤩'];
  const RATING_LABEL = { '-2': 'совсем не интересно', '-1': 'не интересно', '0': 'нейтрально', '1': 'интересно', '2': 'крайне заинтересован' };
  const WEIGHT_ICON = w => (w >= 1.5 ? '🔥' : w >= 0.5 ? '⚡' : w >= 0 ? '·' : '💤');

  async function load() {
    const box = $('sw-news');
    if (!box) return;
    box.innerHTML = `
      <div class="sw-news-bar">
        <select id="nw-period">
          <option value="today" ${period === 'today' ? 'selected' : ''}>Сегодня</option>
          <option value="yesterday" ${period === 'yesterday' ? 'selected' : ''}>Вчера</option>
        </select>
        <button class="icon-btn sw-mini" id="nw-prefs" title="Настроить интересы по категориям">⚙</button>
        <button class="icon-btn sw-mini" id="nw-refresh" title="Обновить">⟳</button>
        <button class="icon-btn sw-mini grad" id="nw-ai" title="Сводка ИИ по открытым новостям">✨</button>
      </div>
      <div class="nw-list" id="nw-list"><div class="empty-state">Загрузка…</div></div>`;
    $('nw-period').onchange = e => { period = e.target.value; fetchNews(); };
    $('nw-refresh').onclick = () => fetchNews();
    $('nw-ai').onclick = () => aiSummary();
    $('nw-prefs').onclick = () => prefsModal();
    fetchNews();
  }

  function prefsModal() {
    if (!data || !data.catsMeta) return;
    const rows = data.catsMeta.map(c => {
      const opts = [-2, -1, 0, 1, 2].map(v =>
        `<option value="${v}" ${c.pref === v ? 'selected' : ''}>${RATING_LABEL[v]}</option>`).join('');
      return `<label class="nw-pref">${c.icon} ${esc(c.label)}
        <select data-cat="${c.key}" data-label="${esc(c.label)}">${opts}</select></label>`;
    }).join('');
    window.APP.openModal(`
      <div class="modal-head"><h3>⚙ Интересы по категориям</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body"><div class="nw-prefs">${rows}</div>
        <div class="hint">Оценки влияют на выборку новостей. Отдельные новости можно оценивать прямо в списке (😞…🤩).</div>
        <button class="btn primary block" id="nw-pref-save">Сохранить</button></div>`);
    $('nw-pref-save').onclick = async () => {
      const items = document.querySelectorAll('.nw-pref [data-cat]');
      for (const el of items) {
        try {
          await fetch('/api/news/pref', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cat: el.dataset.cat, value: Number(el.value) })
          });
        } catch (e) {}
      }
      try { window.APP.closeModal(); } catch (e) {}
      await fetchNews();
    };
  }

  async function fetchNews() {
    const list = $('nw-list');
    list.innerHTML = '<div class="empty-state">Загрузка сводки…</div>';
    try {
      const r = await fetch('/api/news?period=' + period);
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      render();
    } catch (err) {
      list.innerHTML = '<div class="empty-state">Ошибка загрузки новостей</div>';
    }
  }

  function render() {
    const list = $('nw-list');
    if (!data || !data.cats || !data.cats.length) {
      list.innerHTML = '<div class="empty-state">Новостей за период нет (ленты недоступны из этой сети?)</div>';
      return;
    }
    list.innerHTML = data.cats.map(group => {
      const w = group.weight;
      const items = group.items.map(it => {
        const was = it.rating != null ? it.rating : 0;
        const stars = [-2, -1, 0, 1, 2].map(v => {
          const sel = it.rating === v ? ' sel' : '';
          const act = it.rating == null && v === 1 ? ' mild' : '';
          return `<button class="nr${sel}${act}" data-v="${v}" title="${RATING_LABEL[v]}">${RATING_EMOJI[v + 2]}</button>`;
        }).join('');
        return `<div class="nw-item" data-id="${it.id}">
          <a class="nw-link" target="_blank" rel="noopener" href="${esc(it.link)}" title="${esc(it.source)}">${esc(it.title)}</a>
          <span class="nw-src">${esc(it.source || '')}</span>
          <div class="nw-rate">${stars}</div>
        </div>`;
      }).join('');
      return `<div class="nw-group">
        <div class="nw-head"><span>${group.icon} ${esc(group.label)}</span>
          <span class="nw-w" title="Вес выборки по твоим оценкам">${WEIGHT_ICON(w)} ${String(w).replace('-', '−')}</span>
          <span class="nw-count">${group.itemCount}</span>
        </div>
        ${items}
      </div>`;
    }).join('');

    list.querySelectorAll('.nw-item').forEach(itemEl => {
      itemEl.querySelectorAll('.nr').forEach(btn => {
        btn.onclick = async () => {
          const id = itemEl.dataset.id;
          const v = Number(btn.dataset.v);
          itemEl.querySelectorAll('.nr').forEach(b => b.classList.remove('sel', 'mild'));
          btn.classList.add('sel');
          try {
            const r = await fetch('/api/news/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, rating: v }) });
            const d = await r.json();
            if (!d.ok) return;
            if (data.cats) {
              data.cats.forEach(g => {
                const it = g.items.find(x => x.id === id);
                if (it) it.rating = v;
                const w = d.weights && d.weights[g.key];
                if (w != null) g.weight = Math.round(w * 10) / 10;
              });
            }
            renderWeightChipsOnly();
          } catch (e) {}
        };
      });
    });
  }

  function renderWeightChipsOnly() {
    if (!data || !data.cats) return;
    data.cats.forEach(g => {
      const el = document.querySelector(`.nw-group .nw-w`);
      if (!el) return;
      el.setAttribute('title', 'Вес выборки по твоим оценкам');
    });
    // простой способ: перерисовать заголовки групп с новыми весами
    const heads = document.querySelectorAll('.nw-group .nw-head');
    data.cats.forEach((g, i) => {
      const h = heads[i];
      if (!h) return;
      const w = g.weight;
      const wEl = h.querySelector('.nw-w');
      if (wEl) wEl.textContent = `${WEIGHT_ICON(w)} ${String(w).replace('-', '−')}`;
    });
  }

  async function aiSummary() {
    if (!data || !data.cats || !data.cats.length) return;
    const lines = [];
    data.cats.forEach(g => {
      lines.push(g.icon + ' ' + g.label + ':');
      g.items.forEach(it => lines.push(' • ' + it.title + (it.link ? ' (' + it.link + ')' : '')));
    });
    const req = {
      messages: [{
        role: 'user',
        content: 'Сделай короткую сводку этих новостей (по категориям, по 1-2 предложения на категорию, в конце — 2-3 главные темы дня). Только текст, без ссылок:\n\n' + lines.join('\n')
      }]
    };
    window.APP.openModal(`
      <div class="modal-head"><h3>✨ Сводка ИИ</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body"><div id="nw-ai-out" class="nw-ai-out"><div class="empty-state">Думает…</div></div></div>`);
    const out = () => $('nw-ai-out');
    try {
      const r = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      const d = await r.json();
      const o = out();
      if (o) o.innerHTML = '<div class="pre-wrap">' + esc(d.reply || 'Пусто') + '</div>';
    } catch (e) {
      const o = out();
      if (o) o.textContent = '⚠️ Не удалось получить сводку: ' + e.message;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.NEWSBTN = { load };
  });
})();