(function () {
  async function load() {
    const root = document.getElementById('w-msgs');
    if (!root) return;
    try {
      if (window.MSGS) await window.MSGS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MSGS_WIDGET = { load };
})();
