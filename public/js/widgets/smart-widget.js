(function () {
  async function load() {
    const root = document.getElementById('w-smart');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-smart') || document.getElementById('smart-panel') || document.querySelector('#sp-smart, .smart-panel, [data-pane="smart"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.SMART && window.SMART.load) window.SMART.load();
        return;
      }
      if (window.SMART && window.SMART.load) await window.SMART.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.SMART_WIDGET = { load };
})();
