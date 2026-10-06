'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let data = null;
  let sub = localStorage.getItem('kban-msgs-tab') || 'daily';

  async function load() {
    try {
      const r = await fetch('/api/msgs');
      if (r.ok) data = await r.json();
    } catch (e) {}
    render();
  }

  function render() {
    const box = $('sp-msgs');
    if (!box) return;
    document.querySelectorAll('#msgs-panel .st-tab[data-mt]').forEach(t => t.classList.toggle('active', t.dataset.mt === sub));
    if (!data || !data.total) {
      box.innerHTML = '<div class="empty-state">Пока нет ни одного уведомления<br>— статистика появится, когда придут сообщения</div>';
      return;
    }
    const d = data;
    let h = '<div class="msg-sum">' +
      msgChip('🔔 ' + d.total, 'всего уведомлений') +
      msgChip('📆 ' + fmtInt(d.perDay) + '/день', 'в среднем за активный день (' + d.activeDays + ')') +
      (topOf(d.byApp) ? msgChip('🏆 ' + esc(topOf(d.byApp).name), 'самое активное приложение') : '') +
      '</div>';
    if (sub === 'daily') h += renderChart(d.byDay);
    else if (sub === 'hours') h += renderHours(d.byHour);
    else if (sub === 'apps') h += renderRank('Приложения', d.byApp);
    else if (sub === 'users') h += renderRank('Собеседники', d.byUser);
    else if (sub === 'chats') h += renderRank('Чаты', d.byChat);
    box.innerHTML = h;
  }

  function topOf(arr) { return (arr && arr[0]) || null; }

  function fmtInt(v) { return Math.round(v * 10) / 10; }

  function msgChip(label, title) {
    return '<span class="msg-chip" title="' + esc(title || '') + '">' + label + '</span>';
  }

  function renderChart(days) {
    if (!days || !days.length) return '<div class="empty-state">Нет данных</div>';
    const max = Math.max(1, ...days.map(x => x.count));
    const bars = days.map(x => {
      const hPx = Math.max(x.count ? 4 : 1, Math.round((x.count / max) * 60));
      return `<div class="msg-bar-c" title="${x.day}: ${x.count}">
        <div class="msg-bar" style="height:${hPx}px"></div>
        <div class="msg-bar-v">${x.count || ''}</div>
        <div class="msg-bar-d">${x.label}</div>
      </div>`;
    }).join('');
    return '<div class="msg-chart">' + bars + '</div>';
  }

  function renderHours(hours) {
    const max = Math.max(1, ...hours.map(x => x.count));
    const bars = hours.map(x => {
      const hPx = Math.max(x.count ? 3 : 1, Math.round((x.count / max) * 55));
      return `<div class="msg-bar-c" title="${x.h}:00 — ${x.count}">
        <div class="msg-bar msg-bar-h" style="height:${hPx}px"></div>
        <div class="msg-bar-v">${x.count || ''}</div>
        <div class="msg-bar-d">${x.h}</div>
      </div>`;
    }).join('');
    return '<div class="msg-chart msg-hours">' + bars + '</div>';
  }

  function renderRank(title, items) {
    if (!items || !items.length) {
      return '<div class="empty-state">Нет данных' + (title === 'Собеседники' || title === 'Чаты'
        ? '<br><span class="msg-hint-note">поля user/chat появились с новой версией — будут накапливаться с новыми уведомлениями</span>' : '') + '</div>';
    }
    const max = items[0].count || 1;
    return `<div class="msg-rank-title">${esc(title)}</div>` +
      '<div class="int-bars">' + items.map(r => {
        const pct = Math.max(4, Math.round((r.count / max) * 100));
        return `<div class="int-bar" title="${esc(r.name)} — ${r.count}">
          <span class="int-bar-name">${esc(r.name)}</span>
          <span class="int-bar-track"><span class="int-bar-fill" style="width:${pct}%"></span></span>
          <span class="int-bar-v">${fmtInt(r.count)}</span>
        </div>`;
      }).join('') + '</div>';
  }

  function init() {
    const panel = $('msgs-panel');
    if (!panel) return;
    panel.querySelectorAll('.st-tab[data-mt]').forEach(t => {
      t.onclick = () => { sub = t.dataset.mt; localStorage.setItem('kban-msgs-tab', sub); render(); };
    });
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.MSGS = { load };
})();