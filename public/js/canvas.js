(function () {
  const KEY = 'kban-view';
  const MIN = 0.15;
  const MAX = 3;

  function clampS(v) {
    return Math.max(MIN, Math.min(MAX, v));
  }

  const st = { s: 1 };

  function scroll() {
    return { x: window.scrollX || 0, y: window.scrollY || 0 };
  }

  function scrollTo(x, y) {
    try { window.scrollTo(x, y); } catch (e) { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const world = document.getElementById('world');
    if (!world) return;

    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      st.s = clampS(d.s || 1);
    } catch (e) { /* ignore */ }

    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    }

    function apply() {
      world.style.transform = 'scale(' + st.s + ')';
    }
    apply();

    function toCanvas(cx, cy) {
      const sc = scroll();
      return { cx: (sc.x + cx) / st.s, cy: (sc.y + cy) / st.s };
    }

    function zoomAt(clientX, clientY, factor) {
      const sc = scroll();
      const pc = toCanvas(clientX, clientY);
      st.s = clampS(st.s * factor);
      scrollTo(pc.cx * st.s - clientX, pc.cy * st.s - clientY);
      apply();
      save();
    }

    function reset() {
      st.s = 1;
      scrollTo(0, 0);
      apply();
      save();
    }

    function visible() {
      const sc = scroll();
      return {
        left: sc.x / st.s,
        top: sc.y / st.s,
        width: window.innerWidth / st.s,
        height: window.innerHeight / st.s
      };
    }

    window.CANVAS = {
      view: function () { return { s: st.s, x: 0, y: 0 }; },
      zoomAt: zoomAt,
      reset: reset,
      toCanvas: toCanvas,
      visible: visible,
      save: save,
      apply: apply
    };

    const zoomCtl = document.getElementById('zoom-ctl');
    if (zoomCtl) {
      zoomCtl.addEventListener('click', function (e) {
        const b = e.target.closest('[data-zoom]');
        if (!b) return;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        if (b.dataset.zoom === 'in') zoomAt(cx, cy, 1.25);
        else if (b.dataset.zoom === 'out') zoomAt(cx, cy, 1 / 1.25);
        else reset();
      });
    }

    world.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      }
    }, { passive: false });

    const touches = new Map();
    let lastSpan = null;

    world.addEventListener('pointerdown', function (e) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        lastSpan = null;
      }
    }, true);

    world.addEventListener('pointerup', function (e) {
      touches.delete(e.pointerId);
      lastSpan = null;
      if (touches.size < 2) lastSpan = null;
    }, true);

    world.addEventListener('pointercancel', function (e) {
      touches.delete(e.pointerId);
      lastSpan = null;
    }, true);

    world.addEventListener('pointermove', function (e) {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const pts = Array.from(touches.values());
      const span = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      if (lastSpan) {
        zoomAt(mx, my, span / lastSpan);
      }
      lastSpan = span;
    });
  });
})();