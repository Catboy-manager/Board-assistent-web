(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  function fmtDur(d) {
    if (!d || !isFinite(d)) return '';
    const h = Math.floor(d / 3600), m = Math.round((d % 3600) / 60);
    return (h ? h + ' ч ' : '') + m + ' мин';
  }

  function load() {
    const pane = $('sp-interests');
    if (!pane) return;
    pane.innerHTML = '<div class="yt-hint">⏳ Считаю интересы…</div>';
    fetch('/api/yt/interests')
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(render)
      .catch(() => { if (pane) pane.innerHTML = '<div class="yt-hint">⚠️ Нет данных — пока ничего не просмотрено.</div>'; });
  }

  function render(d) {
    const pane = $('sp-interests');
    if (!pane) return;
    if (!d.total) {
      pane.innerHTML = `<div class="int-empty">
        <div class="int-empty-ic">🧠</div>
        <div>Пока пусто. Смотрите видео в панели «YouTube» — просмотры пойдут сюда, и я соберу вашу векторную карту интересов.</div>
        <button class="icon-btn int-refresh">⟳ Обновить</button>
      </div>`;
      bindButtons();
      return;
    }
    const radar = radarSvg(d.cats);
    const bars = d.cats.filter(c => c.weight > 0).map(c => `
      <div class="int-bar" title="${c.label}: ${c.count}">
        <span class="int-bar-ic">${c.icon}</span>
        <span class="int-bar-name">${c.label}</span>
        <div class="int-bar-track"><div class="int-bar-fill" style="width:${c.weight}%"></div></div>
        <span class="int-bar-v">${c.count}</span>
      </div>`).join('');
    const themes = (d.themes || []).filter(t => t.count > 0);
    const themeBars = themes.map(c => `
      <div class="int-bar" title="${c.label}: ${c.count}">
        <span class="int-bar-ic">${c.icon}</span>
        <span class="int-bar-name">${c.label} <span class="int-auto">авто</span></span>
        <div class="int-bar-track"><div class="int-bar-fill" style="width:${c.weight}%"></div></div>
        <span class="int-bar-v">${c.count}</span>
      </div>`).join('');
    const chips = d.top.length ? d.top.map(t => `<span class="int-chip">${t.w}</span>`).join('') : '<span class="int-chip muted">нет слов</span>';
    const recent = d.recent.length ? d.recent.map(r => `
      <li class="int-rec">
        <span class="int-rec-t" title="${$esc(r.title)}">${$esc(r.title)}</span>
        <span class="int-rec-c">${$esc(r.channel)}</span>
      </li>`).join('') : '<li class="int-rec muted">недавних просмотров нет</li>';
    const portraitHtml = d.portrait ? `
      <div class="int-title">Портрет</div>
      <div class="int-portrait">
        <div class="int-portrait-head"><span class="int-portrait-ic">${d.portrait.icon || '🧑'}</span>
          <span class="int-portrait-title">${$esc(d.portrait.title || '')}</span></div>
        <div class="int-portrait-sum">${$esc(d.portrait.summary || '')}</div>
      </div>` : '';

    pane.innerHTML = `
      <div class="int-actions">
        <span class="int-sum">${d.total} записей · ${d.totalMin} мин${d.queries ? ' · ' + d.queries + ' запросов' : ''}</span>
        <button class="icon-btn int-refresh" title="Обновить">⟳</button>
        <button class="icon-btn int-clear" title="Очистить историю просмотров">🗑</button>
      </div>
      ${portraitHtml}
      <div class="int-title">Вектор интересов</div>
      ${radar}
      <div class="int-title">Категории</div>
      <div class="int-bars">${bars || '<div class="int-empty">Интересы пока не выделились — посмотрите ещё пару роликов.</div>'}</div>
      ${themes.length ? '<div class="int-title">Авто-темы</div><div class="int-bars">' + themeBars + '</div>' : ''}
      <div class="int-title">Частые слова</div>
      <div class="int-chips">${chips}</div>
      <div class="int-title">Недавние просмотры</div>
      <ul class="int-recs">${recent}</ul>`;
    bindButtons();
  }

  function bindButtons() {
    const pane = $('sp-interests');
    if (!pane) return;
    pane.querySelectorAll('.int-refresh').forEach(b => b.onclick = () => load());
    const clr = pane.querySelector('.int-clear');
    if (clr) clr.onclick = () => {
      const dlg = $('modal');
      if (!dlg) return;
      dlg.innerHTML = `<div class="m-title">Очистить историю просмотров?</div>
        <div class="m-text">Векторная карта интересов обнулится, но учёт продолжится с новых просмотров.</div>
        <div class="m-act">
          <button class="icon-btn m-btn" data-res="1">Очистить</button>
          <button class="icon-btn m-btn" data-res="0">Отмена</button>
        </div>`;
      dlg.classList.remove('hidden');
      dlg.querySelectorAll('.m-btn').forEach(b => b.onclick = () => {
        dlg.classList.add('hidden');
        if (b.dataset.res === '1') {
          fetch('/api/yt/watch/clear', { method: 'POST' }).then(load).catch(load);
        }
      });
    };
  }

  /* SVG-«радар»: категории по лучам */
  function radarSvg(cats) {
    const w = 300, h = 210, cx = 150, cy = 100, R = 78;
    const vis = cats.filter(c => c.weight > 0).slice(0, 10);
    if (!vis.length) return '<div class="yt-hint">Нет интересов</div>';
    const n = vis.length, step = (Math.PI * 2) / n;
    const pt = (i, r) => {
      const a = -Math.PI / 2 + i * step;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    let rings = '';
    for (const f of [0.25, 0.5, 0.75, 1]) {
      rings += `<polygon points="${vis.map((_, i) => pt(i, R * f).join(',')).join(' ')}" class="int-ring"></polygon>`;
    }
    let spokes = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, R);
      spokes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="int-spoke"></line>`;
    }
    const poly = vis.map((c, i) => pt(i, R * Math.max(0.08, c.weight / 100)).join(',')).join(' ');
    const labels = vis.map((c, i) => {
      const [x, y] = pt(i, R + 22);
      let tx = 'middle';
      if (Math.abs(x - cx) / (R + 22) > 0.7) tx = x < cx ? 'end' : 'start';
      return `<text x="${x}" y="${y}" class="int-lab" text-anchor="${tx}">${c.icon}${c.label.split(' и ')[0]}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="int-radar">${rings}${spokes}<polygon points="${poly}" class="int-poly"></polygon><polygon points="${poly}" class="int-poly-line" fill="none"></polygon>${labels}</svg>`;
  }

  function $esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.INT = { load };
})();