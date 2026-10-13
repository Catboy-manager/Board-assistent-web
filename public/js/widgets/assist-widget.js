(function () {
  async function load() {
    const root = document.getElementById('w-assist');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-assist') || document.getElementById('assist-panel') || document.querySelector('#sp-assist, .assist-panel, [data-pane="assist"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.ASSIST && window.ASSIST.load) window.ASSIST.load();
        return;
      }
      if (window.ASSIST && window.ASSIST.load) await window.ASSIST.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.ASSIST_WIDGET = { load };
})();
