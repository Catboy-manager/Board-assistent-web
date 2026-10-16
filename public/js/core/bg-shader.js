(function () {
  const KEY = 'nb-shaders';
  const root = document.documentElement;
  function apply() {
    let on = false;
    try { on = (localStorage.getItem(KEY) || '0') === '1'; } catch (e) {}
    root.setAttribute('data-shaders', on ? '1' : '0');
    if (on && !document.getElementById('nb-shader-bg')) {
      const d = document.createElement('div');
      d.id = 'nb-shader-bg';
      d.className = 'nb-shader-bg';
      d.innerHTML = '<div class="nb-shader-layer nb-sh1"></div><div class="nb-shader-layer nb-sh2"></div>';
      document.body.appendChild(d);
    } else if (!on) {
      const d = document.getElementById('nb-shader-bg');
      if (d) d.remove();
    }
  }
  apply();
  window.BGSHADER = { toggle: (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} apply(); } };
  document.addEventListener('DOMContentLoaded', apply);
})();
