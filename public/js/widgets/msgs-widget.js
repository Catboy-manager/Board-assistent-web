(function () {
  async function load() {
    const root = document.getElementById('w-msgs');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-msgs') || document.getElementById('msgs-panel') || document.querySelector('#sp-msgs, .msgs-panel, [data-pane="msgs"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.MSGS && window.MSGS.load) window.MSGS.load();
        return;
      }
      if (window.MSGS && window.MSGS.load) await window.MSGS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MSGS_WIDGET = { load };
})();
