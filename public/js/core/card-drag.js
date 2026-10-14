(function () {
  let dragged = null;
  function init() {
    const grid = document.querySelector('.grid');
    if (!grid) return;
    grid.querySelectorAll('.dash-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        dragged = card;
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        if (dragged) dragged.classList.remove('dragging');
        dragged = null;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target.closest('.dash-card');
        if (!target || target === dragged) return;
        const rect = target.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        grid.insertBefore(dragged, before ? target : target.nextSibling);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
