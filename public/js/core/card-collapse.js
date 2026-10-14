(function () {
  function init() {
    document.querySelectorAll('.dash-card').forEach(card => {
      const body = card.querySelector('.dash-card-body');
      if (!body) return;
      if (card.querySelector('.card-toggle')) return;
      const h = card.querySelector('.dash-card-header');
      if (!h) return;
      const btn = document.createElement('button');
      btn.className = 'btn-ghost card-toggle';
      btn.textContent = '▼';
      btn.onclick = (e) => {
        e.stopPropagation();
        body.classList.toggle('collapsed');
        btn.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
      };
      h.appendChild(btn);
    });
  }
  document.addEventListener('DOMContentLoaded', init);
  window.CARD_COLLAPSE = { init };
})();
