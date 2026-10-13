(function () {
  async function load() {
    const root = document.getElementById('w-notify');
    if (!root) return;
    try {
      if (window.NOTIFY) await window.NOTIFY.loadHistory();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.NOTIFY_WIDGET = { load };
})();
