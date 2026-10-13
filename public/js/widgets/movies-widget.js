(function () {
  async function load() {
    const root = document.getElementById('w-movies');
    if (!root) return;
    try {
      await window.MOVIES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MOVIES_WIDGET = { load };
})();
