'use strict';

(function () {
  function toast(title, msg, warn) {
    try { if (window.APP && window.APP.toast) window.APP.toast(title, msg, warn); } catch (e) {}
    try { if (window.ASSIST && window.ASSIST.toast) window.ASSIST.toast(title, msg); } catch (e) {}
  }
  function notify(title, body) {
    try {
      if (Notification.permission === 'granted') new Notification(title, { body, icon: '🔔' });
    } catch (e) {}
  }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fmtTs(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return 'сегодня ' + hh;
    const y = now.getFullYear() - d.getFullYear();
    if (y === 0 && d.getTime() > now.getTime() - 7 * 86400000) {
      return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()] + ' ' + hh;
    }
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    return (y ? d.getFullYear() + '.' : '') + dd + '.' + mm + ' ' + hh;
  }

  let rendered = false;
  let replayTimer = null;

  /* Приватность: банковские SMS и платёжные уведомления не показываем */
  const PRIVACY_APP_RE = /сбер|тиньк|tinkoff|втб|альфа|alfa|райф|совком|газпром|открытие|сбп|юмани|yoomoney|киви|qiwi|банк|bank|вклад|депозит|хоум|кредитн|мобил\w{0,4}\s*банк/i;
  const PRIVACY_TEXT_RE = /сбер|тиньк|tinkoff|\bвтб|альфа|alfa|райф|совком|газпром|открытие|сбп|юмани|yoomoney|киви|qiwi|банк|bank|вклад|депозит|карт|счет|счёт|плат[её]ж|оплат|списан|зачислен|перевод|транзак|квитанци|смс-?код|код подтверждени|подтверждени\w{0,12}(перевода|операци|плат[её]жа)|покупк|заблокирован|баланс|остаток|purchase|payment|transfer|credited|debited|paid|\d[\d\s]{2,}\s?(₽|руб(лей)?\.?|rub|₴|\$|usd|eur|euro)/i;

  function isPrivate(item) {
    if (!item) return false;
    const app = String(item.app || '').trim();
    const s = app + ' ' + String(item.title || '') + ' ' + String(item.text || '');
    return PRIVACY_APP_RE.test(app) || PRIVACY_TEXT_RE.test(s);
  }

  function renderAll(items) {
    const box = $('sw-notif');
    if (!box) return;
    items = (items || []).filter(it => !isPrivate(it));
    if (!items || !items.length) {
      box.innerHTML = '<div class="empty-state">Уведомлений пока нет</div>';
      return;
    }
    box.innerHTML = items.map(it => `
      <div class="nf-item${it.app === 'Телефон' ? ' phone' : ''}">
        <div class="nf-head">
          <span class="nf-app">${esc(it.app || 'Телефон')}</span>
          <span class="nf-ts">${fmtTs(it.ts)}</span>
        </div>
        ${it.title ? `<div class="nf-title">${esc(it.title)}</div>` : ''}
        ${it.text ? `<div class="nf-text">${esc(it.text)}</div>` : ''}
        ${(it.user || it.chat) ? `<div class="nf-who">👤 ${esc(it.user || '—')}${it.chat ? ' · 💬 ' + esc(it.chat) : ''}</div>` : ''}
      </div>`).join('');
    box.scrollTop = 0;
  }

  async function loadHistory() {
    try {
      const r = await fetch('/api/notify/history?limit=200');
      const d = await r.json();
      renderAll((d.history || []).slice());
    } catch (e) {}
  }

  function pushLive(item) {
    rendered = false;
    loadHistory();
  }

  function initNotify() {
    try {
      window.WIDGET = window.WIDGET || {};
      const prevTab = window.WIDGET.tab;
      window.WIDGET.tab = function (name) {
        if (prevTab) prevTab(name);
        if (name === 'notif') loadHistory();
      };
      if (!window.EventSource) return;
      const es = new EventSource('/api/notify/events');
      es.onmessage = (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.type !== 'phone' || !d.item) return;
        const it = d.item;
        if (isPrivate(it)) return;
        if (d.replay) {
          if (!replayTimer) replayTimer = setTimeout(() => { replayTimer = null; loadHistory(); }, 150);
          return;
        }
        const title = '🔔 ' + (it.app || 'Телефон') + (it.title ? ': ' + it.title : '');
        toast(title, it.text || '');
        notify(title, it.text || '');
        try { if (window.NOTIFY_SOUND && window.NOTIFY_SOUND.play) window.NOTIFY_SOUND.play(it.app, it.title, it.text, it.user, it.chat); } catch (e) {}
        try { if (window.NOTIF_DRAWER && window.NOTIF_DRAWER.push) window.NOTIF_DRAWER.push(it); } catch (e) {}
        pushLive(it);
      };
      es.onerror = () => {};
    } catch (e) {}
  }
  window.NOTIFY = { init: initNotify, loadHistory };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNotify); else initNotify();
})();