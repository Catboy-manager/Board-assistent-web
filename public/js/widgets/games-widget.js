(function () {
  async function load() {
    const root = document.getElementById('w-games');
    if (!root) return;
    try {
      if (window.GAMES) await window.GAMES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.GAMES_WIDGET = { load };
})();
