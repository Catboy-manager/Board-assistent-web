(function () {
  async function load() {
    const root = document.getElementById('w-movies');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-movies') || document.getElementById('movies-panel') || document.querySelector('#sp-movies, .movies-panel, [data-pane="movies"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.MOVIES && window.MOVIES.load) window.MOVIES.load();
        return;
      }
      if (window.MOVIES && window.MOVIES.load) await window.MOVIES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MOVIES_WIDGET = { load };
})();
