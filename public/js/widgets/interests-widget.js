(function () {
  async function load() {
    const root = document.getElementById('w-interests');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-interests') || document.getElementById('interests-panel') || document.querySelector('#sp-interests, .interests-panel, [data-pane="interests"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.INT && window.INT.load) window.INT.load();
        return;
      }
      if (window.INT && window.INT.load) await window.INT.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.INTERESTS_WIDGET = { load };
})();
