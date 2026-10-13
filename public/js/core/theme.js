(function () {
  const KEY = 'neuro-theme';
  const html = document.documentElement;
  const btn = document.querySelector('[data-theme-toggle]');

  function getTheme() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }

  function apply(t) {
    html.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }

  apply(getTheme());

  if (btn) {
    btn.addEventListener('click', () => {
      const t = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(t);
    });
  }

  window.THEME = { get: getTheme, set: apply, toggle: () => apply(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') };
})();
