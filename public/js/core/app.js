(function () {
  const toast = (title, msg) => {
    if (window.NOTIF_DRAWER && window.NOTIF_DRAWER.push) {
      window.NOTIF_DRAWER.push({ title, text: msg });
      return;
    }
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg ? `<div><strong>${title}</strong><div>${msg}</div></div>` : `<div><strong>${title}</strong></div>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 240); }, 3200);
  };
  window.APP = window.APP || {};
  window.APP.toast = toast;
})();
