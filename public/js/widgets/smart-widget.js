(function () {
  async function load() {
    const root = document.getElementById('w-smart');
    if (!root) return;
    try {
      if (window.SMART) await window.SMART.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.SMART_WIDGET = { load };
})();
