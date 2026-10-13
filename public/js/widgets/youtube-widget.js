(function () {
  async function load() {
    const root = document.getElementById('w-youtube');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-youtube') || document.getElementById('youtube-panel') || document.querySelector('#sp-youtube, .youtube-panel, [data-pane="youtube"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.YT && window.YT.load) window.YT.load();
        return;
      }
      if (window.YT && window.YT.load) await window.YT.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.YT_WIDGET = { load };
})();
