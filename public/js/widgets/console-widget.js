(function () {
  async function load() {
    const root = document.getElementById('w-console');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-console') || document.getElementById('console-panel') || document.querySelector('#sp-console, .console-panel, [data-pane="console"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.CONS && window.CONS.load) window.CONS.load();
        return;
      }
      if (window.CONS && window.CONS.load) await window.CONS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.CONSOLE_WIDGET = { load };
})();
