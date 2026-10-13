(function () {
  async function load() {
    const root = document.getElementById('w-gh');
    if (!root) return;
    try {
      if (window.GHBTN) await window.GHBTN.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.GH_WIDGET = { load };
})();
