'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'kban-news/1.0 (kanban-board)';

/* Категории подборок: чем искать на GitHub, ярлык, порог звёзд. */
const BINDS = [
  { kat: 'cli', label: '🛠 CLI-инструменты', q: 'topic:cli', minStars: 500 },
  { kat: 'extension', label: '🔌 Расширения и плагины', q: 'topic:extension topic:browser extension:true', minStars: 300 },
  { kat: 'devtools', label: '🧰 Инструменты разработчика', q: 'topic:developer-tools', minStars: 800 },
  { kat: 'automation', label: '🤖 Автоматизация', q: 'topic:automation', minStars: 800 },
  { kat: 'selfhosted', label: '🏠 Self-hosted', q: 'topic:self-hosted', minStars: 1000 },
  { kat: 'ai', label: '✨ ИИ / LLM', q: 'topic:llm', minStars: 1500 }
];

const LABELS = { cli: '🛠 CLI-инструменты', extension: '🔌 Расширения и плагины', devtools: '🧰 Инструменты разработчика', automation: '🤖 Автоматизация', selfhosted: '🏠 Self-hosted', ai: '✨ ИИ / LLM' };

module.exports = (deps) => {
  const { dataDir, json } = deps;
  const FILE = path.join(dataDir, 'gh.json');
  const TTL = 24 * 3600 * 1000;

  let cache = null;
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = (d && d.picks && d.fetchedAt) ? d : null;
  } catch (e) {}

  function ghFetch(url) {
    return fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  }

  async function fetchPicks() {
    const all = {};
    const jobs = BINDS.map(async (b) => {
      try {
        const q = encodeURIComponent(b.q + ' stars:>' + b.minStars + ' fork:false pushed:>2024-01-01');
        const r = await ghFetch('https://api.github.com/search/repositories?q=' + q + '&sort=stars&order=desc&per_page=8');
        if (!r.ok) return;
        const d = await r.json();
        all[b.kat] = (d.items || []).slice(0, 5).map(x => ({
          name: x.full_name,
          url: x.html_url,
          desc: String(x.description || '').slice(0, 180),
          stars: x.stargazers_count || 0,
          lang: x.language || '',
          topics: (x.topics || []).slice(0, 5),
          updated: x.updated_at ? x.updated_at.slice(0, 10) : ''
        }));
      } catch (e) { all[b.kat] = all[b.kat] || []; }
    });
    await Promise.allSettled(jobs);
    /* Дедупликация: один репозиторий попадает только в одну (первую) категорию. */
    const picks = [];
    const used = new Set();
    for (const b of BINDS) {
      const items = (all[b.kat] || []).filter(x => !used.has(x.name));
      items.forEach(x => used.add(x.name));
      if (!items.length) continue;
      picks.push({ kat: b.kat, label: LABELS[b.kat], items });
    }
    return picks;
  }

  async function digest(refresh) {
    const now = Date.now();
    if (!refresh && cache && now - cache.fetchedAt < TTL) {
      return { fetchedAt: cache.fetchedAt, picks: cache.picks, fromCache: true };
    }
    const picks = await fetchPicks();
    if (picks.length || !cache) {
      cache = { fetchedAt: now, picks };
      try { fs.writeFileSync(FILE, JSON.stringify(cache, null, 2)); } catch (e) {}
    }
    return { fetchedAt: cache.fetchedAt, picks: picks.length ? picks : cache.picks, fromCache: false, rateLimited: picks.length === 0 && !!cache };
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/gh/digest') {
      const refresh = url.searchParams.get('refresh') === '1';
      try { return json(res, 200, await digest(refresh)); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    return false;
  }

  return { handle };
};