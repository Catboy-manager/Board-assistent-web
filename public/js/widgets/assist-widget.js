(function () {
  async function load() {
    const root = document.getElementById('w-assist');
    if (!root) return;
    try {
      if (window.ASSIST) await window.ASSIST.load();
      else if (window.AI) await window.AI.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.ASSIST_WIDGET = { load };
})();
