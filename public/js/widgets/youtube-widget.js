(function () {
  async function load() {
    const root = document.getElementById('w-youtube');
    if (!root) return;
    try {
      if (window.YT) await window.YT.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.YT_WIDGET = { load };
})();
