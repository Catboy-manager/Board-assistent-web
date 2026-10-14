(function () {
  const drawer = document.getElementById('notif-drawer');
  const list = document.getElementById('notif-drawer-list');
  const close = document.getElementById('notif-drawer-close');
  const items = [];
  let timeout = null;

  function render() {
    if (!list) return;
    list.innerHTML = items.slice(-40).reverse().map(it => `
      <div class="notif-drawer-item">
        <div class="nd-title">${escapeHtml(it.title || it.app || 'Уведомление')}</div>
        ${it.text ? `<div class="nd-sub">${escapeHtml(it.text)}</div>` : ''}
        ${it.app ? `<div class="nd-sub">${escapeHtml(it.app)}</div>` : ''}
      </div>
    `).join('');
  }

  function push(item) {
    items.push(item);
    if (items.length > 200) items.splice(0, items.length - 200);
    render();
    open();
  }

  function open() {
    if (!drawer) return;
    drawer.classList.add('open');
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => closeDrawer(), 6000);
  }

  function closeDrawer() {
    if (timeout) { clearTimeout(timeout); timeout = null; }
    if (drawer) drawer.classList.remove('open');
  }

  if (close) close.onclick = closeDrawer;
  if (drawer) drawer.onclick = (e) => { if (e.target === drawer) closeDrawer(); };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  window.NOTIF_DRAWER = { push, open, close: closeDrawer };
})();
