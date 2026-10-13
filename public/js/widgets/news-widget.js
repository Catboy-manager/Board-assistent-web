(function () {
  async function load() {
    const root = document.getElementById('w-news');
    if (!root) return;
    try {
      if (window.NEWSBTN) await window.NEWSBTN.load();
      else if (window.NEWS) await window.NEWS.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.NEWS_WIDGET = { load };
})();
