(function () {
  async function load() {
    const root = document.getElementById('w-console');
    if (!root) return;
    try {
      if (window.CONS) await window.CONS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.CONSOLE_WIDGET = { load };
})();
