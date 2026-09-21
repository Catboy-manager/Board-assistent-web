'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ICON_HEX = /^[0-9a-f]{4,6}$/i;
  let items = [];

  function fmtTs(ts) {
    const d = new Date(ts);
    const now = new Date();
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return hh;
    if (now.getFullYear() === d.getFullYear()) return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hh;
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + ' ' + hh;
  }

  function iconOf(ic) {
    if (ICON_HEX.test(ic || '')) {
      try { return String.fromCodePoint(parseInt(ic, 16)); } catch (e) {}
    }
    return ic || '⚙️';
  }

  function itemHtml(it, cls) {
    const isErr = /ошибк|fail|error|сбой|отказ/i.test(it.text || '') || it.icon === '2757';
    return '<div class="op-item' + (isErr ? ' err' : '') + (cls ? ' ' + cls : '') + '">' +
      '<div class="op-head">' +
        '<span class="op-ic">' + iconOf(it.icon) + '</span>' +
        '<span class="op-title">' + esc(it.title || it.app || 'opencode') + '</span>' +
        '<span class="op-ts">' + fmtTs(it.ts) + '</span>' +
      '</div>' +
      (it.text ? '<div class="op-text">' + esc(it.text) + '</div>' : '') +
    '</div>';
  }

  function renderRes(r) {
    const box = $('op-res');
    if (!box || !r) return;
    const load = (r.load || []).map(x => x.toFixed(2)).join(' ');
    const parts = ['<span class="op-dot"></span>'];
    parts.push('<span>' + (r.temp && r.temp.c ? r.temp.c.toFixed(0) + '°' : '–°') + '</span>');
    parts.push('<span>load <b>' + load + '</b></span>');
    if (r.mem) parts.push('<span>RAM <b>' + Math.round(r.mem.pct) + '%</b></span>');
    if (r.disk) {
      const fmt = k => { const g = k / 1024 / 1024 / 1024; return g >= 1 ? g.toFixed(1) + ' ГБ' : Math.round(k / 1024 / 1024) + ' МБ'; };
      parts.push('<span>диск <b>' + fmt(r.disk.used) + '</b>/<b>' + fmt(r.disk.avail) + '</b></span>');
    }
    if (r.up) parts.push('<span>up ' + Math.round(r.up / 3600) + 'ч</span>');
    box.innerHTML = parts.join(' ');
  }

  function renderList() {
    const box = $('op-list');
    if (!box) return;
    if (!items.length) { box.innerHTML = '<div class="empty-state">Пока не было операций</div>'; return; }
    box.innerHTML = items.slice(0, 60).map(it => itemHtml(it)).join('');
    box.scrollTop = 0;
  }

  function prepend(it) {
    items.unshift(it);
    if (items.length > 80) items.pop();
    const box = $('op-list');
    if (!box) return;
    if (!box.children.length) return renderList();
    box.insertAdjacentHTML('afterbegin', itemHtml(it, ' new'));
    while (box.children.length > 60) box.removeChild(box.lastChild);
  }

  async function load() {
    try {
      const r = await fetch('/api/ops/status');
      const d = await r.json();
      if (d.ops) items = d.ops;
      renderList();
      renderRes(d.res);
      const ah = $('op-ai');
      if (ah && d.ai) {
        const s = 'Запросов к нейросети: ' + (d.ai.total || 0) +
          (d.ai.aborted ? ' · сбоев: ' + d.ai.aborted : '') +
          ' · суммарно ' + Math.round((d.ai.msSum || 0) / 1000) + ' с';
        ah.textContent = s;
      }
    } catch (e) {}
  }

  function initOps() {
    document.querySelectorAll('[data-minim]').forEach(b => {
      b.onclick = () => {
        const p = $(b.getAttribute('data-minim') + '-panel');
        if (!p) return;
        const on = p.classList.toggle('mini');
        b.textContent = on ? '+' : '–';
      };
    });
    load();
    if (!window.EventSource) return;
    let replayPending = false;
    const es = new EventSource('/api/ops/events');
    es.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'op' && d.item) {
        if (d.replay) {
          if (!replayPending) { replayPending = true; setTimeout(() => { replayPending = false; load(); }, 60); }
          return;
        }
        prepend(d.item);
        return;
      }
      if (d.type === 'res' && d.item) renderRes(d.item);
    };
    es.onerror = () => {};
  }

  window.OPS = { load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOps); else initOps();
})();