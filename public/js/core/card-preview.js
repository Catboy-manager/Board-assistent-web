(function () {
  const LIMIT = 3;
  function previewMovies(body, panel) {
    const items = panel.querySelectorAll('.mv-item, .movie-item, .item, li');
    if (!items.length) return false;
    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    for (let i = 0; i < Math.min(LIMIT, items.length); i++) {
      const clone = items[i].cloneNode(true);
      clone.classList.add('preview-item');
      wrap.appendChild(clone);
    }
    body.prepend(wrap);
    return true;
  }
  function previewGeneric(body, panel, sel) {
    const items = panel.querySelectorAll(sel);
    if (!items.length) return false;
    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    for (let i = 0; i < Math.min(LIMIT, items.length); i++) {
      const clone = items[i].cloneNode(true);
      clone.classList.add('preview-item');
      wrap.appendChild(clone);
    }
    body.prepend(wrap);
    return true;
  }
  function hasFull(panel) {
    return panel.querySelectorAll('.mv-list, .list, .news-list, .yt-list, .games-list, .msgs-list').length > 0 || panel.children.length > 0;
  }
  function enhance(card, panel) {
    if (!card || !panel) return;
    const body = card.querySelector('.dash-card-body');
    if (!body) return;
    if (body.dataset.previewed) return;
    body.dataset.previewed = '1';
    let ok = false;
    const mod = card.dataset.module;
    if (mod === 'movies') ok = previewMovies(body, panel);
    else ok = previewGeneric(body, panel, '.item, .row, .news-item, .yt-item, .game-item, .msg-item, li');
    if (!ok && panel.children.length) {
      const wrap = document.createElement('div');
      wrap.className = 'preview-wrap';
      for (let i = 0; i < Math.min(LIMIT, panel.children.length); i++) {
        const ch = panel.children[i];
        if (ch.tagName === 'SCRIPT' || ch.id && ch.id.includes('sw-')) continue;
        const clone = ch.cloneNode(true);
        clone.classList.add('preview-item');
        wrap.appendChild(clone);
      }
      if (wrap.children.length) { body.prepend(wrap); ok = true; }
    }
    if (ok || hasFull(panel)) {
      const more = document.createElement('button');
      more.className = 'btn-ghost more-btn';
      more.textContent = 'Показать всё';
      more.onclick = (e) => {
        e.stopPropagation();
        body.classList.toggle('expanded');
        more.textContent = body.classList.contains('expanded') ? 'Свернуть' : 'Показать всё';
      };
      body.appendChild(more);
    }
  }
  const mo = new MutationObserver(() => {
    document.querySelectorAll('.dash-card').forEach(card => {
      const mod = card.dataset.module;
      const panel = document.getElementById('sw-' + mod) || document.querySelector('#panels-right [id*="' + mod + '"], #panels-right .' + mod + '-panel');
      if (panel && card.querySelector('.dash-card-body').dataset.previewed !== '1') enhance(card, panel);
    });
  });
  document.addEventListener('DOMContentLoaded', () => {
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 60000);
  });
  window.CARD_PREVIEW = { enhance };
})();
