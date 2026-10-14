(function () {
  const audio = document.getElementById('notif-sound');
  async function pick(app, title, text, user, chat) {
    try {
      const r = await fetch('/api/sounds/config');
      const d = await r.json();
      const cfg = d.config || {};
      const low = (app + '|' + title + '|' + text + '|' + user + '|' + chat).toLowerCase();
      for (const rule of (cfg.rules || [])) {
        if (!rule || rule.enabled === false) continue;
        const pat = String(rule.pattern || '').toLowerCase();
        if (pat && low.indexOf(pat) !== -1) {
          return { src: rule.src || cfg.default.src, volume: rule.volume || cfg.default.volume || 0.6 };
        }
      }
      return { src: cfg.default.src || '/sounds/notify.mp3', volume: cfg.default.volume || 0.6 };
    } catch (e) {
      return { src: '/sounds/notify.mp3', volume: 0.6 };
    }
  }
  window.NOTIFY_SOUND = {
    play: async function (app, title, text, user, chat) {
      try {
        if (!audio) return;
        const key = (app + '|' + title + '|' + text).slice(0, 80);
        const now = Date.now();
        if (audio.dataset.last === key && now - parseInt(audio.dataset.lastAt || '0') < 2000) return;
        audio.dataset.last = key;
        audio.dataset.lastAt = String(now);
        const pck = await pick(app, title, text, user, chat);
        audio.src = pck.src;
        audio.volume = pck.volume;
        const pr = audio.play();
        if (pr && pr.catch) pr.catch(() => {});
      } catch (e) {}
    }
  };
})();