(function () {
  const btns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      btns.forEach(b => b.classList.toggle('active', b === btn));
      views.forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    });
  });
})();
