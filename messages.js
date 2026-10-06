'use strict';

module.exports = (deps) => {
  const { json, notify } = deps;

  function dayKey(ts) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function countTop(items, keyOf) {
    const map = {};
    for (const it of items) {
      const k = String(keyOf(it) || '').trim();
      if (!k) continue;
      map[k] = (map[k] || 0) + 1;
    }
    return Object.keys(map)
      .map(name => ({ name, count: map[name] }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12);
  }

  function compute() {
    const hist = notify.history();
    const total = hist.length;
    if (!total) {
      return {
        total: 0,
        byDay: [], byHour: [], byApp: [], byUser: [], byChat: [],
        perDay: 0, activeDays: 0
      };
    }

    const days = {};
    const hours = {};
    const hourCount = new Array(24).fill(0);
    for (const r of hist) {
      const dk = dayKey(r.ts);
      days[dk] = (days[dk] || 0) + 1;
      const h = new Date(r.ts).getHours();
      hourCount[h] = (hourCount[h] || 0) + 1;
    }

    const DAYS = 14;
    const byDay = [];
    const now = new Date();
    const isoNow = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    const base = new Date(isoNow + 'T00:00:00').getTime();
    let activeDays = 0;
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(base - i * 86400000);
      const dk = dayKey(d.getTime());
      const label = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
      const c = days[dk] || 0;
      if (c) activeDays++;
      byDay.push({ day: dk, label, count: c });
    }

    const byApp = countTop(hist, r => r.app);
    const byUser = countTop(hist, r => r.user);
    const byChat = countTop(hist, r => r.chat);

    return {
      total,
      byDay,
      byHour: hourCount.map((count, h) => ({ h, count })),
      byApp,
      byUser,
      byChat,
      perDay: activeDays ? Math.round((total / activeDays) * 10) / 10 : 0,
      activeDays
    };
  }

  function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/msgs') {
      return json(res, 200, compute());
    }
    return false;
  }

  return { handle };
};