(function () {
  const audio = document.getElementById('notif-sound');
  const KEY = 'neuro-sound';
  const mapping = JSON.parse(localStorage.getItem('neuro-sound-map') || '{}');
  function playFor(app, title, text) {
    try {
      if (!audio) return;
      const key = (app + '|' + title + '|' + text).slice(0, 80);
      const now = Date.now();
      if (audio.dataset.last === key && now - parseInt(audio.dataset.lastAt||'0') < 2000) return;
      audio.dataset.last = key; audio.dataset.lastAt = String(now);
      const src = localStorage.getItem(KEY + '-' + app) || localStorage.getItem(KEY + '-default') || '/sounds/notify.mp3';
      audio.src = src;
      audio.volume = parseFloat(localStorage.getItem(KEY + '-vol') || '0.6');
      const p = audio.play(); if (p && p.catch) p.catch(()=>{});
    } catch (e) {}
  }
  window.NOTIFY_SOUND = { play: playFor };
})();
