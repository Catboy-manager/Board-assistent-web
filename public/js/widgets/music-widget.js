(function () {
  async function load() {
    const root = document.getElementById('w-music');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-music') || document.getElementById('music-panel') || document.querySelector('#sp-music, .music-panel, [data-pane="music"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.MUSIC && window.MUSIC.load) window.MUSIC.load();
        return;
      }
      if (window.MUSIC && window.MUSIC.load) await window.MUSIC.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.MUSIC_WIDGET = { load };
})();
