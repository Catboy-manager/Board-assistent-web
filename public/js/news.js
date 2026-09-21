'use strict';

(function () {
  let period = 'today';
  let data = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const RATING_EMOJI = ['😞', '🙁', '😐', '🙂', '🤩'];
  const RATING_LABEL = { '-2': 'совсем не интересно', '-1': 'не интересно', '0': 'нейтрально', '1': 'интересно', '2': 'крайне заинтересован' };
  const WEIGHT_ICON = w => (w >= 1.5 ? '🔥' : w >= 0.5 ? '⚡' : w >= 0 ? '·' : '💤');
  const SRC_BADGE = it => (it.gov ? '🏛 ' : '') + (it.loc === 'intl' ? '🌐 ' : '');

  async function load() {
    const box = $('sw-news');
    if (!box) return;
    box.innerHTML = `
      <div class="sw-news-bar">
        <select id="nw-period">
          <option value="today" ${period === 'today' ? 'selected' : ''}>Сегодня</option>
          <option value="yesterday" ${period === 'yesterday' ? 'selected' : ''}>Вчера</option>
        </select>
        <button class="icon-btn sw-mini" id="nw-prefs" title="Настроить категории, источники и горячие слова">⚙</button>
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
    if (!data) return;
    const catRows = (data.catsMeta || []).map(c => {
      const opts = [-2, -1, 0, 1, 2].map(v =>
        `<option value="${v}" ${c.pref === v ? 'selected' : ''}>${RATING_LABEL[v]}</option>`).join('');
      return `<label class="nw-pref">${c.icon} ${esc(c.label)}
        <select data-cat="${c.key}" data-label="${esc(c.label)}">${opts}</select></label>`;
    }).join('');

    const srcRows = (data.sources || []).map(s => `
      <label class="nw-src-pref" title="${s.gov ? 'государственное СМИ' : ''}">${SRC_BADGE({ gov: s.gov, loc: s.loc })}${esc(s.name)}
        <input type="checkbox" data-src="${s.id}" ${s.enabled ? 'checked' : ''}></label>`).join('');

    window.APP.openModal(`
      <div class="modal-head"><h3>⚙ Новости: интересы и источники</h3><button class="close-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <div class="nw-prefs-title">Категории</div>
        <div class="nw-prefs">${catRows}</div>
        <div class="hint">Веса влияют на наполнение отделов. Отдельные новости оцениваются прямо в списке (😞…🤩) — система дообучается на твоих словах.</div>
        <div class="nw-prefs-title">Источники <span class="nw-legend">${SRC_BADGE({ gov: true, loc: '' })}госСМИ · ${SRC_BADGE({ gov: false, loc: 'intl' })}зарубежные</span></div>
        <div class="nw-srcs">${srcRows}</div>
        <button class="btn primary block" id="nw-pref-save">Сохранить</button></div>`);
    $('nw-pref-save').onclick = async () => {
      const catEls = document.querySelectorAll('.nw-pref [data-cat]');
      for (const el of catEls) {
        try {
          await fetch('/api/news/pref', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cat: el.dataset.cat, value: Number(el.value) }) });
        } catch (e) {}
      }
      const srcEls = document.querySelectorAll('.nw-src-pref [data-src]');
      for (const el of srcEls) {
        try {
          await fetch('/api/news/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: el.dataset.src, enabled: el.checked }) });
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

  function groupHead(g) {
    const hot = (data.hot && data.hot[g.key]) || [];
    const chips = hot.length
      ? `<div class="nw-hot">${hot.map(w => `<button class="nw-hot-chip" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>`
      : '';
    return `<div class="nw-head"><span>${g.icon} ${esc(g.label)}</span>
        <span class="nw-w" title="Вес выборки по твоим оценкам">${WEIGHT_ICON(g.weight)} ${String(g.weight).replace('-', '−')}</span>
        <span class="nw-count">${g.itemCount}</span>
      </div>${chips}
      <button class="nw-more" data-g="${g.key}">＋ Ещё из этого отдела</button>`;
  }

  function render() {
    const list = $('nw-list');
    if (!data || !data.cats || !data.cats.length) {
      list.innerHTML = '<div class="empty-state">Новостей за период нет (ленты недоступны из этой сети?)</div>';
      return;
    }
    list.innerHTML = data.cats.map(group => {
      const items = group.items.map(itemHtml).join('');
      return `<div class="nw-group" data-g="${group.key}">
        ${groupHead(group)}
        <div class="nw-items">${items}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.nw-group').forEach(gEl => bindGroup(gEl));
  }

  function itemHtml(it) {
    const stars = [-2, -1, 0, 1, 2].map(v => {
      const sel = it.rating === v ? ' sel' : '';
      const act = it.rating == null && v === 1 ? ' mild' : '';
      return `<button class="nr${sel}${act}" data-v="${v}" title="${RATING_LABEL[v]}">${RATING_EMOJI[v + 2]}</button>`;
    }).join('');
    const badges = SRC_BADGE(it);
    return `<div class="nw-item" data-id="${it.id}">
      <a class="nw-link" target="_blank" rel="noopener" href="${esc(it.link)}" title="${esc(it.source)}">${esc(it.title)}</a>
      <span class="nw-src" title="${it.gov ? 'государственное СМИ' : it.loc === 'intl' ? 'зарубежный источник' : 'российский источник'}">${badges}${esc(it.source || '')}</span>
      <div class="nw-rate">${stars}</div>
    </div>`;
  }

  function bindGroup(gEl) {
    const gKey = gEl.dataset.g;
    gEl.querySelectorAll('.nw-item').forEach(itemEl => {
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
            if (data && data.cats) {
              data.cats.forEach(g => {
                const it = g.items.find(x => x.id === id);
                if (it) it.rating = v;
                const w = d.weights && d.weights[g.key];
                if (w != null) g.weight = Math.round(w * 10) / 10;
              });
            }
            refreshWeightChips();
          } catch (e) {}
        };
      });
    });

    const moreBtn = gEl.querySelector('.nw-more');
    if (moreBtn) moreBtn.onclick = () => moreOf(gKey, '');

    gEl.querySelectorAll('.nw-hot-chip').forEach(chip => {
      chip.onclick = () => moreOf(gKey, chip.dataset.w);
    });
  }

  async function moreOf(gKey, q) {
    const g = data && data.cats && data.cats.find(x => x.key === gKey);
    if (!g) return;
    const exclude = g.items.map(i => i.id).join(',');
    let url = '/api/news/more?cat=' + encodeURIComponent(gKey) + '&period=' + period + '&n=8&exclude=' + exclude;
    if (q) url += '&q=' + encodeURIComponent(q);
    const gEl = document.querySelector(`.nw-group[data-g="${gKey}"]`);
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!d.items || !d.items.length) {
        const b = gEl && gEl.querySelector('.nw-more');
        if (b) b.textContent = 'больше нет';
        return;
      }
      d.items.forEach(it => g.items.push(it));
      const box = gEl && gEl.querySelector('.nw-items');
      if (box) box.insertAdjacentHTML('beforeend', d.items.map(itemHtml).join(''));
      if (gEl) bindGroup(gEl);
      const cnt = gEl && gEl.querySelector('.nw-count');
      if (cnt) cnt.textContent = g.items.length;
    } catch (e) {}
  }

  function refreshWeightChips() {
    if (!data || !data.cats) return;
    const heads = document.querySelectorAll('.nw-group .nw-head');
    data.cats.forEach((g, i) => {
      const h = heads[i];
      if (!h) return;
      const wEl = h.querySelector('.nw-w');
      if (wEl) wEl.textContent = `${WEIGHT_ICON(g.weight)} ${String(g.weight).replace('-', '−')}`;
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
      if (o) o.innerHTML = '<div class="pre-wrap" style="white-space:pre-wrap">' + esc(d.reply || 'Пусто') + '</div>';
    } catch (e) {
      const o = out();
      if (o) o.textContent = '⚠️ Не удалось получить сводку: ' + e.message;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.NEWSBTN = { load };
  });
})();