'use strict';

const fs = require('fs');
const path = require('path');

module.exports = (deps) => {
  const { json } = deps;
  const ROOT = deps.root || __dirname;
  const COURSE_DIR = deps.courseDir || path.join(ROOT, 'kurs');

  const MD_RE = /^[a-z0-9][a-z0-9._-]*\.md$/i;
  const IMG_RE = /^[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|gif|webp|svg)$/i;

  function safeJoin(dir, name, re) {
    if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\') || name.includes('\0')) return null;
    if (!re.test(name)) return null;
    const full = path.normalize(path.join(dir, name));
    const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
    if (full !== dir && !full.startsWith(base)) return null;
    return full;
  }

  function listFiles() {
    let names = [];
    try {
      names = fs.readdirSync(COURSE_DIR).filter(n => MD_RE.test(n));
    } catch (e) {
      return [];
    }
    function order(n) {
      if (n === 'README.md') return -1;
      if (n === 'otvety.md') return 1000;
      const m = /^(\d+)/.exec(n);
      return m ? Number(m[1]) : 500;
    }
    names.sort((a, b) => order(a) - order(b) || a.localeCompare(b));

    const out = [];
    let num = 0;
    for (const name of names) {
      let title = name;
      try {
        const text = fs.readFileSync(path.join(COURSE_DIR, name), 'utf8');
        const firstLine = text.split(/\r?\n/).find(l => l.trim().startsWith('# '));
        if (firstLine) title = firstLine.replace(/^#\s+/, '').trim();
      } catch (e) {}
      const isReadme = name === 'README.md';
      const isAnswers = name === 'otvety.md';
      if (!isReadme && !isAnswers) num++;
      out.push({ name, title, num: isReadme ? 0 : (isAnswers ? -1 : num), kind: isReadme ? 'intro' : (isAnswers ? 'answers' : 'chapter') });
    }
    return out;
  }

  function handle(p, url, req, res) {
    if (req.method !== 'GET') return false;

    if (p === '/api/course/list') {
      return json(res, 200, { files: listFiles() });
    }

    if (p === '/api/course/file') {
      const name = url.searchParams.get('name') || '';
      const file = safeJoin(COURSE_DIR, name, MD_RE);
      if (!file) return json(res, 400, { error: 'bad name' });
      let st;
      try { st = fs.statSync(file); } catch (e) { st = null; }
      if (!st || !st.isFile()) return json(res, 404, { error: 'not found' });
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return json(res, 500, { error: 'read failed' }); }
      const cache = 'no-cache';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cache });
      return res.end(text);
    }

    if (p === '/api/course/img') {
      const name = url.searchParams.get('name') || '';
      const file = safeJoin(path.join(COURSE_DIR, 'img'), name, IMG_RE);
      if (!file) { res.writeHead(400); return res.end('bad name'); }
      let st;
      try { st = fs.statSync(file); } catch (e) { st = null; }
      if (!st || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file).toLowerCase();
      const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'public, max-age=86400' });
      const rs = fs.createReadStream(file);
      rs.on('error', () => { try { res.destroy(); } catch (e) {} });
      return rs.pipe(res);
    }

    return false;
  }

  return { handle, listFiles };
};
