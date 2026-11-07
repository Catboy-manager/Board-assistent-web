'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n >= 100000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n || 0);

  let started = false;
  let data = { repos: [], local: [] };
  let query = '';
  let sort = 'pushed';

  function setSub(text) {
    const el = $('ghv-sub');
    if (el) el.textContent = text;
  }

  function metaHtml(d) {
    const bits = [];
    if (d.owner) bits.push('👤 ' + esc(d.owner));
    bits.push('📦 ' + (d.repos || []).length + ' репозиториев');
    if (d.hasToken) bits.push('🔐 токен подключён');
    if (d.fromCache) bits.push('из кеша');
    if (d.fetchedAt) bits.push('обновлено ' + new Date(d.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    if (d.rateLimited) bits.push('⚠ GitHub ограничил запросы');
    if (d.error) bits.push('⚠ ' + esc(d.error));
    return bits.join(' · ');
  }

  function repoCard(r) {
    const badges = [];
    if (r.private) badges.push('<span class="ghv-badge private">private</span>');
    if (r.fork) badges.push('<span class="ghv-badge">fork</span>');
    if (r.archived) badges.push('<span class="ghv-badge">archived</span>');
    const topics = (r.topics || []).length ? '<div class="ghv-topics">' + r.topics.map(t => '<span class="ghv-topic">' + esc(t) + '</span>').join('') + '</div>' : '';
    return `<article class="ghv-card">
      <div class="ghv-card-head">
        <a class="ghv-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
        ${badges.join('')}
      </div>
      <div class="ghv-desc">${esc(r.desc) || '<span class="muted">(без описания)</span>'}</div>
      ${topics}
      <div class="ghv-stats">
        <span title="Звёзды">⭐ ${fmt(r.stars)}</span>
        <span title="Форки">🍴 ${fmt(r.forks)}</span>
        ${r.lang ? '<span class="ghv-lang"><i></i>' + esc(r.lang) + '</span>' : ''}
        ${r.pushed || r.updated ? '<span title="Последнее обновление">↻ ' + esc(r.pushed || r.updated) + '</span>' : ''}
      </div>
    </article>`;
  }

  function localCard(l) {
    const last = l.last ? String(l.last).split('\t') : [];
    return `<article class="ghv-local-card">
      <div class="ghv-card-head">
        <b>${esc(l.name)}</b>
        <span class="ghv-badge ${l.git ? 'git' : ''}">${l.git ? 'git' : 'folder'}</span>
      </div>
      <div class="ghv-path" title="${esc(l.dir)}">${esc(l.dir)}</div>
      ${l.desc ? '<div class="ghv-desc">' + esc(l.desc) + '</div>' : ''}
      <div class="ghv-stats">
        ${l.branch ? '<span>🌿 ' + esc(l.branch) + '</span>' : ''}
        ${l.remote ? '<span class="ghv-remote" title="' + esc(l.remote) + '">🔗 ' + esc(l.remote) + '</span>' : ''}
        ${last.length ? '<span title="Последний коммит">↻ ' + esc(last[2] || last[0]) + '</span>' : ''}
      </div>
      <button class="btn mini ghv-copy" data-path="${esc(l.dir)}">Копировать путь</button>
    </article>`;
  }

  function render() {
    const repos = (data.repos || []).filter(r => {
      if (!query) return true;
      const q = query.toLowerCase();
      return String(r.name || '').toLowerCase().includes(q) ||
        String(r.desc || '').toLowerCase().includes(q) ||
        (r.lang || '').toLowerCase().includes(q) ||
        (r.topics || []).some(t => String(t).toLowerCase().includes(q));
    });
    if (sort === 'stars') repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    else if (sort === 'name') repos.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else repos.sort((a, b) => String(b.pushed || b.updated || '').localeCompare(String(a.pushed || a.updated || '')));

    const meta = $('ghv-meta');
    if (meta) meta.innerHTML = metaHtml(data);
    const box = $('ghv-repos');
    if (box) {
      box.innerHTML = repos.length
        ? repos.map(repoCard).join('')
        : '<div class="empty-state">Репозитории не найдены' + (data.error ? '<div class="hint">' + esc(data.error) + '</div>' : '') + '</div>';
    }
    const local = $('ghv-local');
    if (local) {
      local.innerHTML = (data.local || []).length
        ? (data.local || []).map(localCard).join('')
        : '<div class="empty-state">Локальные проекты не найдены</div>';
      local.querySelectorAll('.ghv-copy').forEach(b => {
        b.onclick = () => {
          const p = b.getAttribute('data-path') || '';
          try { navigator.clipboard.writeText(p); b.textContent = 'Скопировано'; } catch (e) {}
          setTimeout(() => { b.textContent = 'Копировать путь'; }, 1200);
        };
      });
    }
    setSub((data.repos || []).length + ' репозиториев · ' + (data.local || []).length + ' локальных');
  }

  async function load(refresh) {
    const box = $('ghv-repos');
    if (box) box.innerHTML = '<div class="empty-state">Загрузка репозиториев…</div>';
    try {
      const r = await fetch('/api/gh/repos' + (refresh ? '?refresh=1' : ''));
      const d = await r.json();
      data = d || { repos: [], local: [] };
      if (!data.repos && data.repos !== []) data.repos = [];
      if (!data.local) data.local = [];
      render();
    } catch (e) {
      if (box) box.innerHTML = '<div class="empty-state">Не удалось загрузить GitHub</div>';
      setSub('ошибка сети');
    }
  }

  function init() {
    if (started) return;
    started = true;
    const search = $('ghv-search');
    if (search) search.oninput = () => { query = search.value.trim(); render(); };
    const sortSel = $('ghv-sort');
    if (sortSel) sortSel.onchange = () => { sort = sortSel.value; render(); };
    const refresh = $('ghv-refresh');
    if (refresh) refresh.onclick = () => load(true);
    load(false);
  }

  window.GHVIEW = { init, load };
})();
