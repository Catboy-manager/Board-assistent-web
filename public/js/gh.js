'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fmtStars = n => n >= 100000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);

  async function load() {
    const box = $('sp-gh');
    if (!box) return;
    if (box.dataset.init) { $('gh-refresh').onclick = () => { fetchDigest(true); }; return; }
    box.dataset.init = '1';
    box.innerHTML = `
      <div class="sw-news-bar">
        <span class="sw-gh-title">⭐ GitHub-подборки</span>
        <button class="icon-btn sw-mini" id="gh-refresh" title="Обновить подборки">⟳</button>
      </div>
      <div class="gh-list" id="gh-list"><div class="empty-state">Загрузка…</div></div>`;
    $('gh-refresh').onclick = () => { fetchDigest(true); };
    fetchDigest(false);
  }

  async function fetchDigest(refresh) {
    const list = $('gh-list');
    list.innerHTML = '<div class="empty-state">Загрузка подборок…</div>';
    try {
      const r = await fetch('/api/gh/digest' + (refresh ? '?refresh=1' : ''));
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      render(d);
    } catch (e) {
      list.innerHTML = '<div class="empty-state">Не удалось загрузить подборки GitHub</div>';
    }
  }

  function render(d) {
    const list = $('gh-list');
    if (!d.picks || !d.picks.length) {
      list.innerHTML = `<div class="empty-state">Подборок пока нет
        ${d.rateLimited ? '<div class="hint">GitHub API временно ограничен — показан прошлый кеш или попробуйте позже.</div>' : ''}</div>`;
      return;
    }
    const when = d.fetchedAt ? ' · обновлено ' + new Date(d.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const meta = `<div class="gh-meta">${d.fromCache ? 'из кеша' : 'свежие'}${when}
      ${d.rateLimited ? '<span class="gh-warn">· GitHub API ограничил запросы</span>' : ''}</div>`;
    list.innerHTML = meta + d.picks.map(g => `
      <div class="gh-group">
        <div class="gh-head">${g.label} <span class="gh-count">${g.items.length}</span></div>
        ${g.items.map(r => `
          <div class="gh-item">
            <a class="gh-name" target="_blank" rel="noopener" href="${esc(r.url)}">${esc(r.name)}</a>
            <span class="gh-stars" title="Звёзды">⭐ ${fmtStars(r.stars)}</span>
            ${r.lang ? `<span class="gh-lang">${esc(r.lang)}</span>` : ''}
            ${r.updated ? `<span class="gh-upd" title="Последний коммит">↻ ${r.updated}</span>` : ''}
            <div class="gh-desc">${esc(r.desc) || '<span class="muted">(без описания)</span>'}</div>
            ${r.topics && r.topics.length ? `<div class="gh-topics">${r.topics.slice(0, 5).map(t => `<span class="gh-topic">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>`).join('')}
      </div>`).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.GHBTN = { load };
  });
})();