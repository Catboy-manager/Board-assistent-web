'use strict';
window.FILES = {
  path: '',

  init() {
    document.getElementById('btn-files').onclick = () => {
      APP.openDrawer('files');
      this.load('');
    };
  },

  async load(rel) {
    this.path = rel || '';
    const list = document.getElementById('files-list');
    list.innerHTML = '<div class="empty-state">Загрузка…</div>';
    document.getElementById('files-breadcrumb').innerHTML = '';
    try {
      const res = await fetch('/api/files?path=' + encodeURIComponent(this.path));
      const data = await res.json();
      this.render(data);
    } catch (e) {
      list.innerHTML = '<div class="empty-state">Ошибка загрузки списка</div>';
    }
  },

  render(data) {
    const list = document.getElementById('files-list');
    document.getElementById('files-breadcrumb').innerHTML = this.crumbHtml(this.path);
    if (data.type === 'file') {
      list.innerHTML = '<div class="empty-state">Это файл (' + this.fmt(data.size) + ')</div>';
      return;
    }
    const entries = data.entries || [];
    if (!entries.length) { list.innerHTML = '<div class="empty-state">Папка пуста</div>'; return; }
    list.innerHTML = entries.map(e => {
      const rel = this.path ? this.path + '/' + e.name : e.name;
      if (e.type === 'dir') {
        return `<div class="file-row dir" data-path="${this.esc(encodeURIComponent(rel))}">
          <span class="fico">📁</span><span class="fname">${this.esc(e.name)}</span><span class="fsize"></span>
        </div>`;
      }
      return `<div class="file-row">
          <span class="fico">📄</span><span class="fname">${this.esc(e.name)}</span>
          <span class="fsize">${this.fmt(e.size)}</span>
          <a class="btn download" title="Скачать" href="/api/file?path=${this.esc(encodeURIComponent(rel))}" download>⬇</a>
        </div>`;
    }).join('');
    list.querySelectorAll('.file-row.dir').forEach(r => {
      r.onclick = () => this.load(r.dataset.path);
    });
  },

  crumbHtml(rel) {
    let html = '<span class="crumb-home" data-path="">📦 корень</span>';
    if (!rel) return html;
    const parts = rel.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      html += `<span class="crumb-sep">/</span><span class="crumb" data-path="${this.esc(encodeURIComponent(acc))}">${this.esc(part)}</span>`;
    }
    return html;
  },

  fmt(size) {
    if (!size && size !== 0) return '';
    if (size < 1024) return size + ' Б';
    if (size < 1048576) return (size / 1024).toFixed(1) + ' КБ';
    if (size < 1073741824) return (size / 1048576).toFixed(1) + ' МБ';
    return (size / 1073741824).toFixed(2) + ' ГБ';
  },

  esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
};

document.addEventListener('DOMContentLoaded', () => FILES.init());

document.addEventListener('click', (e) => {
  const crumb = e.target.closest('.crumb, .crumb-home');
  if (crumb) FILES.load(crumb.dataset.path);
});