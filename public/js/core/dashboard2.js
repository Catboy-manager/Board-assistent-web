(function () {
  const STORE_KEY = 'neuro-dash2-order';
  const EXP_KEY = 'neuro-dash2-exp';

  function themeToggle() {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('neuro-theme', t); } catch (e) {}
  }

  function notifToggle() {
    const d = document.getElementById('notif-drawer2');
    if (d) d.classList.toggle('open');
  }

  function expanders() {
    document.querySelectorAll('[data-expand]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-expand');
        const body = document.getElementById(id);
        if (body) {
          body.classList.toggle('expanded');
          btn.textContent = body.classList.contains('expanded') ? 'Свернуть' : 'Показать всё';
          const exp = JSON.parse(localStorage.getItem(EXP_KEY) || '{}');
          exp[id] = body.classList.contains('expanded');
          localStorage.setItem(EXP_KEY, JSON.stringify(exp));
        }
      };
    });
  }

  function restoreExpand() {
    try {
      const exp = JSON.parse(localStorage.getItem(EXP_KEY) || '{}');
      Object.keys(exp).forEach(id => {
        if (exp[id]) {
          const body = document.getElementById(id);
          if (body) body.classList.add('expanded');
          const btn = document.querySelector(`[data-expand="${id}"]`);
          if (btn) btn.textContent = 'Свернуть';
        }
      });
    } catch (e) {}
  }

  function loadPreviews() {
    const map = [
      ['movies', '#pv-movies', '.mv-item, .movie-item, .item'],
      ['news', '#pv-news', '.news-item, .item'],
      ['youtube', '#pv-youtube', '.yt-item, .item'],
      ['games', '#pv-games', '.game-item, .item'],
      ['smart', '#pv-smart', '.device, .sm-item, .item'],
      ['notify', '#pv-notify', '.nf-item, .item'],
      ['msgs', '#pv-msgs', '.msg-item, .item'],
      ['stats', '#pv-stats', '.st-row, .stat, .item'],
      ['interests', '#pv-interests', '.int-item, .item'],
      ['gh', '#pv-gh', '.gh-item, .item'],
      ['console', '#pv-console', 'pre, .line'],
      ['files', '#pv-files', '.file-row, .item'],
      ['ops', '#pv-ops', '.op-line, .item'],
      ['assist', '#pv-assist', '.ai-line, .item'],
      ['music', '#pv-music', '.track, .item'],
      ['sounds', '#pv-sounds', '.snd-rule, .item']
    ];
    map.forEach(([mod, pvId, sel]) => {
      const pv = document.querySelector(pvId);
      if (!pv) return;
      const panel = document.getElementById('sw-' + mod) || document.querySelector('#panels-right [id*="' + mod + '"]');
      if (!panel) return;
      const items = panel.querySelectorAll(sel);
      if (!items.length && panel.children.length) {
        for (let i = 0; i < Math.min(2, panel.children.length); i++) {
          const ch = panel.children[i];
          if (ch.tagName === 'SCRIPT') continue;
          const d = document.createElement('div');
          d.className = 'pv-item';
          d.textContent = ch.textContent.trim().slice(0, 80);
          pv.appendChild(d);
        }
      } else {
        for (let i = 0; i < Math.min(3, items.length); i++) {
          const clone = items[i].cloneNode(true);
          clone.className = 'pv-item';
          pv.appendChild(clone);
        }
      }
    });
  }

  function init() {
    const tt = document.getElementById('theme-toggle2');
    if (tt) tt.onclick = themeToggle;
    const nt = document.getElementById('notif-toggle2');
    if (nt) nt.onclick = notifToggle;
    const ncl = document.getElementById('notif-drawer-close2');
    if (ncl) ncl.onclick = notifToggle;
    expanders();
    restoreExpand();
    loadPreviews();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
