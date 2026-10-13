(function () {
  async function load() {
    const root = document.getElementById('w-ops');
    if (!root) return;
    try {
      if (window.OPS) await window.OPS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.OPS_WIDGET = { load };
})();
