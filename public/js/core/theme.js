(function () {
  const KEY = 'neuro-theme';
  const KEY_MODE = 'neuro-theme-mode';
  const html = document.documentElement;
  const btn = document.querySelector('[data-theme-toggle]');

  function getTheme() {
    let mode = 'auto';
    try { mode = localStorage.getItem(KEY_MODE) || 'auto'; } catch (e) {}
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }

  function apply(t, mode) {
    html.setAttribute('data-theme', t);
    if (mode) {
      try { localStorage.setItem(KEY_MODE, mode); } catch (e) {}
    }
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }

  apply(getTheme());

  if (btn) {
    btn.addEventListener('click', () => {
      const t = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(t, 'auto');
    });
  }

  window.THEME = {
    get: getTheme,
    set: (t, mode = 'auto') => apply(t, mode),
    toggle: () => apply(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', 'auto'),
    setMode: (mode) => { const t = getThemeForMode(mode); apply(t, mode); },
    getMode: () => { try { return localStorage.getItem(KEY_MODE) || 'auto'; } catch (e) { return 'auto'; } }
  };

  function getThemeForMode(mode) {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }
})();
