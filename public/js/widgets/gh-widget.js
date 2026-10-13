(function () {
  async function load() {
    const root = document.getElementById('w-gh');
    if (!root) return;
    try {
      const panel = document.getElementById('sw-gh') || document.getElementById('gh-panel') || document.querySelector('#sp-gh, .gh-panel, [data-pane="gh"]');
      if (panel) {
        root.innerHTML = '';
        root.appendChild(panel);
        if (window.GHBTN && window.GHBTN.load) window.GHBTN.load();
        return;
      }
      if (window.GHBTN && window.GHBTN.load) await window.GHBTN.load();
    } catch (e) { root.innerHTML = '<div class="card-sub">Ошибка загрузки</div>'; }
  }
  window.GH_WIDGET = { load };
})();
