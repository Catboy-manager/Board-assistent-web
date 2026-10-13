(function () {
  async function load() {
    const root = document.getElementById('w-interests');
    if (!root) return;
    try {
      if (window.INT) await window.INT.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.INTERESTS_WIDGET = { load };
})();
