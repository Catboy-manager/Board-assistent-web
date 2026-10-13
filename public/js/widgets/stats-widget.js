(function () {
  async function load() {
    const root = document.getElementById('w-stats');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-stats') || document.getElementById('stats-panel') || document.querySelector('#sp-stats, .stats-panel, [data-pane="stats"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.STATS && window.STATS.load) window.STATS.load();
        return;
      }
      if (window.STATS && window.STATS.load) await window.STATS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.STATS_WIDGET = { load };
})();
