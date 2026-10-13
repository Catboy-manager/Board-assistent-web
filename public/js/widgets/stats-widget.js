(function () {
  async function load() {
    const root = document.getElementById('w-stats');
    if (!root) return;
    try {
      if (window.STATS) await window.STATS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.STATS_WIDGET = { load };
})();
