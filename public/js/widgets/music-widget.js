(function () {
  async function load() {
    const root = document.getElementById('w-music');
    if (!root) return;
    try {
      if (window.MUSIC) await window.MUSIC.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MUSIC_WIDGET = { load };
})();
