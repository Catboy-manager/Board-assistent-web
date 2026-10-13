(function () {
  async function load() {
    const root = document.getElementById('w-news');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-news') || document.getElementById('news-panel') || document.querySelector('#sp-news, .news-panel, [data-pane="news"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.NEWSBTN && window.NEWSBTN.load) window.NEWSBTN.load();
        return;
      }
      if (window.NEWSBTN && window.NEWSBTN.load) await window.NEWSBTN.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.NEWS_WIDGET = { load };
})();
