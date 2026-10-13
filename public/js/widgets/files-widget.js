(function () {
  async function load() {
    const root = document.getElementById('w-files');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-files') || document.getElementById('files-panel') || document.querySelector('#sp-files, .files-panel, [data-pane="files"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.FILES && window.FILES.load) window.FILES.load();
        return;
      }
      if (window.FILES && window.FILES.load) await window.FILES.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.FILES_WIDGET = { load };
})();
