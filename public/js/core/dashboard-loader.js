(function () {
  function loadAll() {
    const map = [
      ['w-movies', 'MOVIES_WIDGET'],
      ['w-news', 'NEWS_WIDGET'],
      ['w-music', 'MUSIC_WIDGET'],
      ['w-youtube', 'YT_WIDGET'],
      ['w-smart', 'SMART_WIDGET'],
      ['w-notify', 'NOTIFY_WIDGET'],
      ['w-games', 'GAMES_WIDGET'],
      ['w-msgs', 'MSGS_WIDGET'],
      ['w-stats', 'STATS_WIDGET'],
      ['w-interests', 'INTERESTS_WIDGET'],
      ['w-gh', 'GH_WIDGET'],
      ['w-console', 'CONSOLE_WIDGET'],
      ['w-files', 'FILES_WIDGET'],
      ['w-ops', 'OPS_WIDGET'],
      ['w-assist', 'ASSIST_WIDGET']
    ];
    map.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        if (window[key] && window[key].load) window[key].load();
      } catch (e) {}
    });
  }
  document.addEventListener('DOMContentLoaded', loadAll);
  window.DASHBOARD = { reload: loadAll };
})();
