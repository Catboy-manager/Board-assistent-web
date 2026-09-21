'use strict';

(function () {
  const $ = id => document.getElementById(id);

  function init() {
    const panel = $('sys-panel');
    if (!panel) return;
    const tabs = panel.querySelectorAll('.st-tab[data-sys]');
    if (!tabs.length) return;
    const panes = panel.querySelectorAll('.sp-pane');
    const shown = {};

    tabs.forEach(b => {
      b.onclick = () => {
        const k = b.dataset.sys;
        tabs.forEach(x => x.classList.toggle('active', x === b));
        panes.forEach(p => p.classList.toggle('active', p.id === 'sp-' + k));
        if (k === 'gh' && !shown.gh) { shown.gh = true; if (window.GHBTN && window.GHBTN.load) window.GHBTN.load(); }
        if (k === 'console' && !shown.console) { shown.console = true; if (window.CONS && window.CONS.load) window.CONS.load(); }
      };
    });

    const active = panel.querySelector('.st-tab.active');
    if (active) active.onclick();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.SYS = { init };
})();