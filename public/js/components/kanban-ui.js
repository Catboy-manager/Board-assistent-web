(function () {
  async function loadKanban() {
    try {
      const res = await fetch('/api/data');
      const d = await res.json();
      const cols = (d.board && d.board.columns) || [];
      const cards = (d.board && d.board.cards) || [];
      const root = document.getElementById('view-kanban');
      if (!root) return;
      root.innerHTML = `
        <div class="kanban-wrap" id="kb-wrap"></div>
      `;
      const wrap = document.getElementById('kb-wrap');
      cols.forEach(col => {
        const c = document.createElement('div');
        c.className = 'kanban-col';
        c.dataset.col = col.id;
        const list = cards.filter(x => x.columnId === col.id);
        c.innerHTML = `
          <div class="kanban-col-header">
            <span class="kanban-col-title">${escapeHtml(col.title)}</span>
            <span class="card-sub">${list.length}</span>
            <button class="btn-ghost" data-add>+ Карточка</button>
          </div>
          <div class="kanban-col-body" data-body></div>
        `;
        const body = c.querySelector('[data-body]');
        list.forEach(card => {
          const el = document.createElement('div');
          el.className = 'kanban-card';
          el.draggable = true;
          el.dataset.card = card.id;
          el.innerHTML = `<div><strong>${escapeHtml(card.title||'')}</strong></div><div class="card-sub">${escapeHtml(card.text||'').slice(0,120)}</div>`;
          el.ondragstart = e => { el.classList.add('dragging'); e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed='move'; };
          el.ondragend = () => el.classList.remove('dragging');
          body.appendChild(el);
        });
        wrap.appendChild(c);
      });
      // basic drop
      wrap.querySelectorAll('.kanban-col-body').forEach(b => {
        b.ondragover = e => { if (e.dataTransfer.types.includes('text/plain')) e.preventDefault(); };
        b.ondrop = async e => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/plain');
          const colId = b.closest('.kanban-col').dataset.col;
          const d2 = await fetch('/api/data').then(r=>r.json());
          const card = (d2.board.cards||[]).find(x=>x.id===id);
          if (card) {
            card.columnId = colId;
            await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d2)});
            loadKanban();
          }
        };
      });
    } catch (e) { console.error(e); }
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  window.KANBANUI = { load: loadKanban };
  document.addEventListener('DOMContentLoaded', ()=>{ loadKanban(); });
})();
