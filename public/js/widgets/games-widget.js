(function () {
  async function load() {
    const root = document.getElementById('w-games');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-games') || document.getElementById('games-panel') || document.querySelector('#sp-games, .games-panel, [data-pane="games"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.GAMES && window.GAMES.load) window.GAMES.load();
        return;
      }
      if (window.GAMES && window.GAMES.load) await window.GAMES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.GAMES_WIDGET = { load };
})();
