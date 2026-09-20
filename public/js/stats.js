'use strict';

(function () {
  const $ = id => document.getElementById(id);
  let last = null;
  let active = 'disk';

  const fmtG = k => { const g = k / 1024 / 1024 / 1024; return g >= 1 ? g.toFixed(1) + ' ГБ' : Math.round(k / 1024 / 1024) + ' МБ'; };

  function bar(pct, color) {
    return '<div class="st-bar"><div class="st-fill" style="width:' + Math.max(2, Math.min(100, pct)) + '%;' + (color ? 'background:' + color + ';' : '') + '"></div></div>';
  }

  function renderDisk(d) {
    if (!d || !d.size) { $('st-disk').innerHTML = '<div class="empty-state">Нет данных</div>'; return; }
    const pct = d.size ? Math.round((d.used / d.size) * 100) : 0;
    $('st-disk').innerHTML =
      '<div class="st-pv">' + pct + '<span>%</span></div>' +
      '<div class="st-label">заполненность диска</div>' +
      bar(pct, pct > 90 ? '#e66' : (pct > 75 ? '#e8a33d' : null)) +
      '<table class="st-table">' +
      '<tr><th>Всего</th><td>' + fmtG(d.size) + '</td></tr>' +
      '<tr><th>Используется</th><td>' + fmtG(d.used) + '</td></tr>' +
      '<tr><th>Свободно</th><td>' + fmtG(d.avail) + '</td></tr>' +
      '</table>';
  }

  function renderTemp(t) {
    const box = $('st-temp');
    if (!t || !t.c) { box.innerHTML = '<div class="empty-state">Температура неизвестна</div>'; return; }
    const c = t.c;
    const color = c >= 85 ? '#e66' : (c >= 70 ? '#e8a33d' : null);
    box.innerHTML =
      '<div class="st-pv" style="' + (color ? 'color:' + color + ';' : '') + '">' + c.toFixed(0) + '<span>°C</span></div>' +
      '<div class="st-label">температура сервера</div>' +
      bar(Math.max(0, Math.min(100, (c / 100) * 100)), color || null) +
      '<table class="st-table"><tr><th>Датчик</th><td>' + String(t.zone || 'thermal') + '</td></tr></table>';
  }

  function renderRam(m) {
    const box = $('st-ram');
    if (!m || !m.total) { box.innerHTML = '<div class="empty-state">Нет данных</div>'; return; }
    const used = m.total - m.free;
    const pct = Math.round((used / m.total) * 100);
    box.innerHTML =
      '<div class="st-pv">' + pct + '<span>%</span></div>' +
      '<div class="st-label">оперативная память занята</div>' +
      bar(pct, pct > 90 ? '#e66' : null) +
      '<table class="st-table">' +
      '<tr><th>Всего</th><td>' + fmtG(m.total) + '</td></tr>' +
      '<tr><th>Занято</th><td>' + fmtG(used) + '</td></tr>' +
      '<tr><th>Свободно</th><td>' + fmtG(m.free) + '</td></tr>' +
      (m.rss ? '<tr><th>node (RSS)</th><td>' + fmtG(m.rss) + '</td></tr>' : '') +
      '</table>';
  }

  function render() {
    if (!last) return;
    if (active === 'disk') renderDisk(last.disk);
    else if (active === 'temp') renderTemp(last.temp);
    else renderRam(last.mem);
  }

  function switchTab(name) {
    active = name;
    document.querySelectorAll('.st-tab').forEach(t => t.classList.toggle('active', t.dataset.st === name));
    document.querySelectorAll('.st-pane').forEach(p => { const on = p.id === 'st-' + name; p.classList.toggle('active', on); if (on) p.classList.remove('hidden'); else p.classList.add('hidden'); });
    render();
  }

  async function load() {
    try {
      const r = await fetch('/api/ops/status');
      const d = await r.json();
      if (d.res) last = d.res;
      render();
    } catch (e) {}
  }

  function initStats() {
    document.querySelectorAll('.st-tab').forEach(t => {
      t.onclick = () => switchTab(t.dataset.st);
    });
    load();
    if (!window.EventSource) return;
    const es = new EventSource('/api/ops/events');
    es.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'res' && d.item) { last = d.item; render(); }
    };
    es.onerror = () => {};
    setInterval(load, 30000);
  }

  window.STATS = { load, switchTab };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStats); else initStats();
})();