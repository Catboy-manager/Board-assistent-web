'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let data = { steam: [], third: [], cfg: { steamId: '', hasKey: false }, source: '', steamAt: 0, lastError: '' };
  let sub = localStorage.getItem('kban-games-tab') || 'steam';
  let catResults = null;
  let catQuery = '';
  let catBusy = false;

  function fmtHrs(h) {
    h = Number(h || 0);
    if (h >= 1) return (Math.round(h * 10) / 10) + ' ч';
    if (h > 0) return Math.round(h * 60) + ' мин';
    return '';
  }
  function fmtLast(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    return (sameDay ? 'сегодня ' : dd + '.' + mm + ' ') +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function ageText(at) {
    if (!at) return '';
    const min = Math.floor((Date.now() - at) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return min + ' мин назад';
    return Math.floor(min / 60) + ' ч назад';
  }
  function formatTooltip(g) {
    const parts = [];
    if (g.hours) parts.push('Всего: ' + fmtHrs(g.hours));
    if (g.hours2w) parts.push('За 2 недели: ' + fmtHrs(g.hours2w));
    if (g.last) parts.push('Последний запуск: ' + fmtLast(g.last));
    return parts.join('\n');
  }

  async function load() {
    try {
      const r = await fetch('/api/games');
      if (r.ok) data = await r.json();
    } catch (e) {}
    render();
  }

  function render() {
    const box = $('sp-games');
    if (!box) return;
    document.querySelectorAll('#games-panel .st-tab[data-gs]').forEach(t => t.classList.toggle('active', t.dataset.gs === sub));
    box.innerHTML = sub === 'steam' ? renderSteam() : sub === 'third' ? renderThird() : renderCatalog();
    bindSteam();
    bindThird();
    bindCatalog();
  }

  function cfgOpen() {
    const c = data.cfg || {};
    return !c.steamId || data._cfgOpen;
  }

  function statusLine() {
    const src = data.source === 'api' ? 'Steam API' : data.source === 'xml' ? 'Steam · публичный профиль' : '—';
    const age = data.steamAt ? ageText(data.steamAt) : '';
    return '🎮 ' + data.steam.length + ' игр · ' + src + (age ? ' · обновлено ' + age : '');
  }

  function renderSteam() {
    const c = data.cfg || {};
    let h = '<div class="gm-cfg">';
    if (cfgOpen()) {
      h += '<div class="gm-cfg-open">' +
        '<input id="gm-sid" placeholder="Steam ID или ссылка на профиль" value="' + esc(c.steamId || '') + '">' +
        '<input id="gm-key" type="password" placeholder="Steam Web API ключ (необязательно)" value="' + esc(data._key || '') + '">' +
        '<button id="gm-save">Сохранить и загрузить</button>' +
        '</div>';
    }
    h += '<div class="gm-cfg-row">' +
      '<span class="gm-cfg-info">' + (c.steamId ? '🔗 ' + esc(c.steamId) + (c.hasKey ? ' · ключ ✓' : ' · без ключа (XML)') : 'Не настроено') + '</span>' +
      '<button class="gm-btn" id="gm-edit" title="Изменить привязку">⚙</button>' +
      (c.steamId ? '<button class="gm-btn" id="gm-refresh" title="Обновить библиотеку">🔄</button>' : '') +
      (c.steamId ? '<button class="gm-btn" id="gm-reset" title="Забыть Steam">ₓ</button>' : '') +
      '</div>';

    if (data.lastError) h += '<div class="gm-err">⚠ ' + esc(data.lastError) + '</div>';
    if (data.source) h += '<div class="gm-st">' + statusLine() + '</div>';
    else if (c.steamId) h += '<div class="gm-st muted">Библиотека ещё не загружена — нажмите 🔄.</div>';
    else h += '<div class="gm-st muted">Укажите профиль Steam (steamcommunity.com/id/имя или /profiles/765…) — список подтянется автоматически.</div>';

    if (!data.steam.length) h += '<div class="empty-state">Игр нет</div>';
    else h += '<div class="gm-grid">' + data.steam.map(steamCard).join('') + '</div>';
    return h;
  }

  function steamCard(g) {
    return `<div class="gm-card" data-appid="${g.appid}" title="${esc(formatTooltip(g))}">
      <div class="gm-post">
        <img src="${g.poster}" data-s2="https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg" loading="lazy" alt="">
        <a class="gm-store" href="https://store.steampowered.com/app/${g.appid}/" target="_blank" rel="noopener" title="Страница в магазине">ⓘ</a>
        <a class="gm-play" href="steam://rungameid/${g.appid}" title="Запустить через Steam">▶</a>
      </div>
      <div class="gm-name" title="${esc(g.name)}">${esc(g.name)}</div>
      <div class="gm-meta">${fmtHrs(g.hours)}${g.hours2w ? ' · ' + fmtHrs(g.hours2w) + ' (2 н.)' : ''}${g.last ? ' · 🕐 ' + fmtLast(g.last) : ''}</div>
    </div>`;
  }

  function renderThird() {
    let h = '<div class="gm-add">' +
      '<input id="gm-tadd" placeholder="Добавить стороннюю игру…">' +
      '<input id="gm-thrs" type="number" min="0" step="1" placeholder="часы" title="Сколько часов уже играли">' +
      '<button id="gm-tadd-btn">+</button>' +
      '</div>';
    const need = data.third.filter(g => !g.poster);
    if (need.length) h += '<button class="gm-btn block" id="gm-resolve-all">🖼 Найти постеры (' + need.length + ')</button>';
    if (!data.third.length) h += '<div class="empty-state">Сторонних игр пока нет — добавьте вручную</div>';
    else h += '<div class="gm-grid">' + data.third.map(thirdCard).join('') + '</div>';
    h += '<div class="gm-hint">Сторонние игры — весь офлайн/вне-Steam: постеры ищутся так же, как у фильмов.</div>';
    return h;
  }

  function thirdCard(g) {
    const ph = esc(String(g.title || '?').charAt(0).toUpperCase());
    return `<div class="gm-card gm-third ${g.played ? 'played' : ''}" data-id="${g.id}">
      <div class="gm-post">
        ${g.poster
          ? `<img src="${g.poster}" data-s2="" loading="lazy" alt="">`
          : `<div class="gm-post-ph" title="Постер ещё не найден">${ph}</div>`}
        <button class="gm-btn gm-badge gm-b-left" data-t3="toggle" title="${g.played ? 'Снять отметку «сыграна»' : 'Пометить сыгранной'}">${g.played ? '✓' : '○'}</button>
        <button class="gm-btn gm-badge gm-b-del" data-t3="del" title="Удалить">✕</button>
      </div>
      <div class="gm-name" title="${esc(g.title)}">${esc(g.title)}</div>
      <div class="gm-meta">${g.played ? '✅ сыграна' : '📥 в планах'}${g.hours ? ' · ' + fmtHrs(g.hours) : ''}${g.price ? ' · ' + esc(g.price) : ''}</div>
      <div class="gm-acts">
        ${g.store ? `<a class="gm-btn gm-store-btn" href="${esc(g.store)}" target="_blank" rel="noopener" title="Страница в магазине">ⓘ</a>` : ''}
        <button class="gm-btn" data-t3="resolve" title="Найти постер">🖼</button>
        <button class="gm-btn" data-t3="hrs" title="Указать проведённые часы">${fmtHrs(g.hours) || '0ч'}</button>
      </div>
    </div>`;
  }

  /* ---- каталог сторонних сервисов ---- */

  function renderCatalog() {
    let h = '<div class="gm-add">' +
      '<input id="gm-cq" placeholder="Поиск в каталоге (например, Hollow Knight, Ведьмак, Dark Souls)…" value="' + esc(catQuery) + '">' +
      '<button id="gm-cq-btn">Найти</button>' +
      '</div>';
    h += '<div class="gm-hint">Каталог GOG + Steam (без ключей): найдите игру (лучше по латинице) и добавьте в свою библиотеку — постер и ссылка на магазин подтянутся.</div>';
    if (catBusy) h += '<div class="gm-st">поиск…</div>';
    else if (catResults === null) h += '<div class="empty-state">Начните поиск в каталоге</div>';
    else if (catResults.error) h += '<div class="gm-err">⚠ ' + esc(catResults.error) + '</div>';
    else if (!catResults.games || !catResults.games.length) h += '<div class="empty-state">Ничего не найдено</div>';
    else h += '<div class="gm-grid">' + catResults.games.map(catCard).join('') + '</div>';
    return h;
  }

  function catCard(g) {
    const ph = esc(String(g.title || '?').charAt(0).toUpperCase());
    return `<div class="gm-card gm-cat" data-cid="${esc(g.id)}">
      <div class="gm-post">
        ${g.poster
          ? `<img src="${g.poster}" data-s2="" loading="lazy" alt="">`
          : `<div class="gm-post-ph">${ph}</div>`}
        ${g.store ? `<a class="gm-btn gm-store" href="${esc(g.store)}" target="_blank" rel="noopener" title="Страница в магазине">ⓘ</a>` : ''}
        <span class="gm-src">${esc(g.source || '')}</span>
      </div>
      <div class="gm-name" title="${esc(g.title)}">${esc(g.title)}</div>
      <div class="gm-meta">${g.price ? esc(g.price) : ''}${g.genres && g.genres.length ? ' · ' + esc(g.genres.slice(0, 2).join(', ')) : ''}${g.devs && g.devs.length ? ' · ' + esc(g.devs[0]) : ''}</div>
      <div class="gm-acts">
        <button class="gm-btn" data-cadd="1" title="Добавить в библиотеку">＋ В библиотеку</button>
      </div>
    </div>`;
  }

  function bindCatalog() {
    const box = $('sp-games');
    const input = $('gm-cq'), btn = $('gm-cq-btn');
    const doSearch = async () => {
      if (catBusy) return;
      const q = (input && input.value.trim()) || '';
      if (!q) return;
      catBusy = true;
      catQuery = q;
      render();
      try {
        const r = await fetch('/api/games/catalog', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q })
        });
        catResults = await r.json();
      } catch (e) { catResults = { error: 'поиск не удался: ' + (e.message || '') }; }
      catBusy = false;
      render();
    };
    if (btn) btn.onclick = doSearch;
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    box.querySelectorAll('.gm-card.gm-cat [data-cadd]').forEach(b => b.onclick = async () => {
      const card = b.closest('.gm-card.gm-cat');
      const g = (catResults.games || []).find(x => String(x.id) === card.getAttribute('data-cid'));
      if (!g) return;
      b.disabled = true; b.textContent = '…';
      try {
        const r = await fetch('/api/games/third', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: g.title, poster: g.poster || '', store: g.store || '', price: g.price || '' })
        });
        const d = await r.json();
        if (d && d.game) {
          try { window.APP.toast('Игры', 'Добавлено: ' + g.title); } catch (e) {}
          b.textContent = '✓ Добавлено';
          setTimeout(() => { b.disabled = false; b.textContent = '＋ В библиотеку'; }, 2000);
        }
      } catch (e) { b.disabled = false; b.textContent = '＋ В библиотеку'; }
    });
    wirePosterFallback(box);
  }

  function wirePosterFallback(box) {
    box.querySelectorAll('.gm-post > img').forEach(img => {
      img.onerror = () => {
        if (img.dataset.s2 && !img.dataset.fb) {
          img.dataset.fb = '1';
          const alt = img.dataset.s2;
          img.dataset.s2 = '';
          img.src = alt;
          return;
        }
        const phEl = document.createElement('div');
        phEl.className = 'gm-post-ph';
        phEl.textContent = '';
        img.replaceWith(phEl);
      };
    });
  }

  function bindSteam() {
    const box = $('sp-games');
    const sid = $('gm-sid'), keyEl = $('gm-key'), save = $('gm-save');
    if (save && sid) save.onclick = async () => {
      let steamId = sid.value.trim();
      steamId = steamId.replace(/^https?:\/\/(www\.)?steamcommunity\.com\/(id|profiles)\//, '').replace(/\/.*$/, '');
      const apiKey = keyEl ? keyEl.value.trim() : '';
      save.disabled = true; save.textContent = '⏳ Подключаем…';
      try {
        const r = await fetch('/api/games/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamId, apiKey })
        });
        const d = await r.json();
        if (d && d.error) { try { window.APP.toast('Steam', d.error, true); } catch (e) {} }
        else data._cfgOpen = false;
      } catch (e) {}
      save.disabled = false; save.textContent = 'Сохранить и загрузить';
      await load();
    };
    if (sid) sid.addEventListener('keydown', e => { if (e.key === 'Enter' && save) save.onclick(); });
    if (keyEl) keyEl.addEventListener('keydown', e => { if (e.key === 'Enter' && save) save.onclick(); });
    const edit = $('gm-edit');
    if (edit) edit.onclick = () => { data._cfgOpen = !data._cfgOpen; render(); };
    const reset = $('gm-reset');
    if (reset) reset.onclick = async () => {
      if (!confirm('Забыть привязку Steam?')) return;
      await fetch('/api/games/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steamId: '', apiKey: '' }) });
      data._cfgOpen = false;
      await load();
    };
    const refresh = $('gm-refresh');
    if (refresh) refresh.onclick = async () => {
      refresh.disabled = true; refresh.textContent = '⏳';
      await fetch('/api/games/refresh', { method: 'POST' });
      refresh.disabled = false; refresh.textContent = '🔄';
      await load();
    };
    wirePosterFallback(box);
  }

  function bindThird() {
    const box = $('sp-games');
    const addBtn = $('gm-tadd-btn');
    const add = async () => {
      const inp = $('gm-tadd'), hrs = $('gm-thrs');
      const t = (inp && inp.value.trim()) || '';
      if (!t) return;
      if (inp) inp.value = '';
      try {
        await fetch('/api/games/third', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t, hours: hrs ? Number(hrs.value) || 0 : 0 })
        });
      } catch (e) {}
      await load();
    };
    if (addBtn) addBtn.onclick = add;
    const addInp = $('gm-tadd');
    if (addInp) addInp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

    box.querySelectorAll('.gm-card.gm-third').forEach(card => {
      const id = card.getAttribute('data-id');
      card.querySelectorAll('[data-t3]').forEach(btn => btn.onclick = async (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-t3');
        try {
          if (act === 'del') {
            if (!confirm('Удалить игру из библиотеки?')) return;
            await fetch('/api/games/third/' + id + '/delete', { method: 'POST' });
          } else if (act === 'toggle') {
            await fetch('/api/games/third/' + id + '/toggle', { method: 'POST' });
          } else if (act === 'resolve') {
            btn.disabled = true;
            await fetch('/api/games/third/' + id + '/resolve', { method: 'POST' });
            btn.disabled = false;
            setTimeout(load, 3500);
            return;
          } else if (act === 'hrs') {
            const cur = (data.third.find(x => x.id === id) || {}).hours || 0;
            const v = prompt('Сколько часов уже играли:', String(cur));
            if (v === null) return;
            await fetch('/api/games/third/' + id + '/hours', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hours: Number(v) || 0 })
            });
          }
        } catch (err) {}
        await load();
      });
    });
    const ra = $('gm-resolve-all');
    if (ra) ra.onclick = async () => {
      const need = (data.third || []).filter(g => !g.poster);
      if (!need.length) return;
      ra.disabled = true;
      const t0 = Date.now();
      for (let i = 0; i < need.length; i++) {
        ra.textContent = '🖼 Постеры ' + (i + 1) + '/' + need.length + '…';
        await fetch('/api/games/third/' + need[i].id + '/resolve', { method: 'POST' }).catch(() => {});
        await new Promise(r => setTimeout(r, 1200));
        if (Date.now() - t0 > 600000) break;
      }
      await load();
    };
    wirePosterFallback(box);
  }

  function init() {
    const panel = $('games-panel');
    if (!panel) return;
    panel.querySelectorAll('.st-tab[data-gs]').forEach(t => {
      t.onclick = () => { sub = t.dataset.gs; localStorage.setItem('kban-games-tab', sub); render(); };
    });
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.GAMES = { load };
})();