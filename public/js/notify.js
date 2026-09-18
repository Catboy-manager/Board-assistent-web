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
  function initNotify() {
    try {
      if (!window.EventSource) return;
      const es = new EventSource('/api/notify/events');
      es.onmessage = (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.type !== 'phone' || !d.item) return;
        const it = d.item;
        const title = '🔔 ' + (it.app || 'Телефон') + (it.title ? ': ' + it.title : '');
        toast(title, it.text || '');
        notify(title, it.text || '');
      };
      es.onerror = () => {};
    } catch (e) {}
  }
  window.NOTIFY = { init: initNotify };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNotify); else initNotify();
})();