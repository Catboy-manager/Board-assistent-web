(function () {
  async function load() {
    const root = document.getElementById('w-ops');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-ops') || document.getElementById('ops-panel') || document.querySelector('#sp-ops, .ops-panel, [data-pane="ops"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.OPS && window.OPS.load) window.OPS.load();
        return;
      }
      if (window.OPS && window.OPS.load) await window.OPS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.OPS_WIDGET = { load };
})();
