(function () {
  async function load() {
    const root = document.getElementById('w-notify');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-notify') || document.getElementById('notify-panel') || document.querySelector('#sp-notify, .notify-panel, [data-pane="notify"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.NOTIFY && window.NOTIFY.load) window.NOTIFY.load();
        return;
      }
      if (window.NOTIFY && window.NOTIFY.load) await window.NOTIFY.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.NOTIFY_WIDGET = { load };
})();
