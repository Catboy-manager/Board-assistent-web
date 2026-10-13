(function () {
  async function load() {
    const root = document.getElementById('w-files');
    if (!root) return;
    try {
      if (window.FILES) await window.FILES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.FILES_WIDGET = { load };
})();
