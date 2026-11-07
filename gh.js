'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

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
  const { dataDir, json, root, projectsDir, cfg } = deps;
  const FILE = path.join(dataDir, 'gh.json');
  const REPOS_FILE = path.join(dataDir, 'gh-repos.json');
  const TTL = 24 * 3600 * 1000;
  const REPOS_TTL = 10 * 60 * 1000;
  const LOCAL_TTL = 60 * 1000;

  let cache = null;
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = (d && d.picks && d.fetchedAt) ? d : null;
  } catch (e) {}

  let reposCache = null;
  try {
    const d = JSON.parse(fs.readFileSync(REPOS_FILE, 'utf8'));
    reposCache = (d && Array.isArray(d.repos) && d.fetchedAt) ? d : null;
  } catch (e) {}

  let localCache = { at: 0, data: [] };

  function getCfg() {
    try { return (typeof cfg === 'function' ? cfg() : cfg) || {}; } catch (e) { return {}; }
  }

  function owner() {
    const c = getCfg();
    return String((c.github && c.github.owner) || process.env.KANBAN_GH_OWNER || 'Catboy-manager');
  }

  function token() {
    const c = getCfg();
    return String((c.github && c.github.token) || process.env.GITHUB_TOKEN || '');
  }

  function ghFetch(url) {
    const headers = { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(url, { headers, signal: AbortSignal.timeout(15000) });
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

  async function fetchRepos(refresh) {
    const now = Date.now();
    const o = owner();
    if (!refresh && reposCache && now - reposCache.fetchedAt < REPOS_TTL) {
      return Object.assign({}, reposCache, { fromCache: true });
    }
    const t = token();
    const api = t
      ? 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner'
      : 'https://api.github.com/users/' + encodeURIComponent(o) + '/repos?per_page=100&sort=updated';
    let r;
    try { r = await ghFetch(api); }
    catch (e) {
      if (reposCache) return Object.assign({}, reposCache, { fromCache: true, error: String((e && e.message) || e) });
      throw e;
    }
    if (!r.ok) {
      const error = 'GitHub API HTTP ' + r.status;
      if (reposCache) return Object.assign({}, reposCache, { fromCache: true, error, rateLimited: r.status === 403 || r.status === 429 });
      throw new Error(error);
    }
    const arr = await r.json();
    const repos = (Array.isArray(arr) ? arr : []).map(x => ({
      name: x.name,
      fullName: x.full_name,
      url: x.html_url,
      desc: String(x.description || '').slice(0, 300),
      stars: x.stargazers_count || 0,
      forks: x.forks_count || 0,
      lang: x.language || '',
      private: !!x.private,
      fork: !!x.fork,
      archived: !!x.archived,
      updated: x.updated_at ? x.updated_at.slice(0, 10) : '',
      pushed: x.pushed_at ? x.pushed_at.slice(0, 10) : '',
      topics: (x.topics || []).slice(0, 8),
      homepage: x.homepage || '',
      defaultBranch: x.default_branch || ''
    })).sort((a, b) => String(b.pushed || b.updated).localeCompare(String(a.pushed || a.updated)));
    reposCache = { fetchedAt: now, owner: o, hasToken: !!t, repos };
    try { fs.writeFileSync(REPOS_FILE, JSON.stringify(reposCache, null, 2)); } catch (e) {}
    return Object.assign({}, reposCache, { fromCache: false });
  }

  function runGit(dir, args) {
    return new Promise((resolve) => {
      execFile('git', ['-C', dir, ...args], { timeout: 3000, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : String(stdout || '').trim());
      });
    });
  }

  async function describeLocal(dir, fallbackName) {
    if (!dir) return null;
    let isDir = false;
    try { isDir = fs.statSync(dir).isDirectory(); } catch (e) {}
    if (!isDir) return null;
    const isGit = fs.existsSync(path.join(dir, '.git'));
    const hasPkg = fs.existsSync(path.join(dir, 'package.json'));
    if (!isGit && !hasPkg) return null;
    let name = fallbackName || path.basename(dir);
    let desc = '';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      name = pkg.name || name;
      desc = String(pkg.description || '');
    } catch (e) {}
    return {
      name,
      dir,
      git: isGit,
      remote: isGit ? await runGit(dir, ['remote', 'get-url', 'origin']) : '',
      branch: isGit ? await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) : '',
      last: isGit ? await runGit(dir, ['log', '-1', '--format=%h%x09%s%x09%ar']) : '',
      desc
    };
  }

  async function getLocal(refresh) {
    const now = Date.now();
    if (!refresh && localCache.at && now - localCache.at < LOCAL_TTL) return localCache.data;
    const dirs = [];
    if (root) dirs.push({ dir: root, name: 'kanban-board' });
    const pd = (() => { try { return typeof projectsDir === 'function' ? projectsDir() : projectsDir; } catch (e) { return ''; } })();
    if (pd) {
      try {
        for (const it of fs.readdirSync(pd, { withFileTypes: true })) {
          if (!it.isDirectory() || it.name.startsWith('.') || it.name === 'node_modules') continue;
          dirs.push({ dir: path.join(pd, it.name), name: it.name });
        }
      } catch (e) {}
    }
    const desktop = path.join(os.homedir(), 'Documents', 'kanban-desktop');
    for (const n of ['linux', 'windows']) {
      const d = path.join(desktop, n);
      if (fs.existsSync(d)) dirs.push({ dir: d, name: 'Board-assistent-' + n });
    }
    const seen = new Set();
    const out = [];
    for (const d of dirs) {
      let real = d.dir;
      try { real = fs.realpathSync(d.dir); } catch (e) {}
      if (seen.has(real)) continue;
      seen.add(real);
      const item = await describeLocal(d.dir, d.name);
      if (item) out.push(item);
    }
    out.sort((a, b) => Number(b.git) - Number(a.git) || a.name.localeCompare(b.name));
    localCache = { at: now, data: out };
    return out;
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/gh/digest') {
      const refresh = url.searchParams.get('refresh') === '1';
      try { return json(res, 200, await digest(refresh)); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/gh/repos') {
      const refresh = url.searchParams.get('refresh') === '1';
      try {
        const [repoData, local] = await Promise.all([fetchRepos(refresh), getLocal(refresh)]);
        return json(res, 200, Object.assign({ ok: true, local }, repoData));
      } catch (e) {
        return json(res, 200, { ok: false, owner: owner(), hasToken: !!token(), repos: [], local: await getLocal(false), error: String((e && e.message) || e) });
      }
    }
    return false;
  }

  return { handle };
};