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

    function safeTop() {
      const tb = document.getElementById('topbar');
      const h = tb ? tb.getBoundingClientRect().height : 65;
      return Math.ceil((h + 6 + (window.scrollY || 0)) / st.s);
    }

    function safeRight() {
      const w = window.innerWidth || 0;
      let dock = 0;
      if (w >= 1000) {
        const av = getComputedStyle(document.documentElement).getPropertyValue('--ai-w');
        const m = /(-?[\d.]+)px/.exec(av || '');
        if (m) dock = parseFloat(m[1]);
      }
      return Math.ceil((w - dock + (window.scrollX || 0)) / st.s);
    }

    window.CANVAS = {
      view: function () { return { s: st.s, x: 0, y: 0 }; },
      zoomAt: zoomAt,
      reset: reset,
      toCanvas: toCanvas,
      visible: visible,
      safeTop: safeTop,
      safeRight: safeRight,
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

    const pan = { on: false, px: 0, py: 0, sx: 0, sy: 0, id: null };

    function isPanTarget(t) {
      return t && (t.id === 'world' || t.id === 'world-bg' || t.id === 'board' || t.id === 'board-inner');
    }

    world.addEventListener('pointerdown', function (e) {
      if ((e.isPrimary !== undefined && !e.isPrimary)) return;
      if (e.button !== 0 && e.button !== 1) return;
      if (!isPanTarget(e.target)) return;
      const sc = scroll();
      pan.on = true;
      pan.px = e.clientX;
      pan.py = e.clientY;
      pan.sx = sc.x;
      pan.sy = sc.y;
      pan.id = e.pointerId;
      try { world.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      world.classList.add('panning');
    });

    world.addEventListener('pointermove', function (e) {
      if (!pan.on || e.pointerId !== pan.id) return;
      scrollTo(pan.sx - (e.clientX - pan.px), pan.sy - (e.clientY - pan.py));
    });

    function endPan(e) {
      if (e && pan.id != null && e.pointerId !== pan.id) return;
      if (pan.id != null) {
        try {
          if (world.hasPointerCapture(pan.id)) world.releasePointerCapture(pan.id);
        } catch (err) { /* ignore */ }
      }
      pan.on = false;
      pan.id = null;
      world.classList.remove('panning');
      save();
    }
    world.addEventListener('pointerup', endPan);
    world.addEventListener('pointercancel', endPan);

    const touches = new Map();
    let lastSpan = null;

    world.addEventListener('pointerdown', function (e) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        pan.on = false;
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