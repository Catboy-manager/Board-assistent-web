'use strict';

module.exports = (deps) => {
  const { dataDir, json } = deps;
  const path = require('path');
  const fs = require('fs');
  const os = require('os');

  const MUSIC_DIR = process.env.KANBAN_MUSIC_DIR || path.join(os.homedir(), 'Music');
  const AUDIO_EXT = { mp3: true, flac: true, ogg: true, opus: true, wav: true, m4a: true, aac: true, m4b: true, webm: true };
  const AUDIO_MIME = { mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', m4b: 'audio/mp4', webm: 'audio/webm' };

  const MARK_FILE = path.join(dataDir, 'music.json');

  let marked = {};
  try { const d = JSON.parse(fs.readFileSync(MARK_FILE, 'utf8')); marked = (d && d.marked) || {}; } catch (e) {}

  function saveMarked() { try { fs.writeFileSync(MARK_FILE, JSON.stringify({ marked }, null, 2)); } catch (e) {} }

  function isAudio(name) { return AUDIO_EXT[String(name).split('.').pop().toLowerCase()]; }

  function walk(dir, rel, depth, out) {
    if (depth > 4) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const en of entries) {
      if (en.name.startsWith('.')) continue;
      const full = path.join(dir, en.name);
      const rp = rel ? rel + '/' + en.name : en.name;
      if (en.isDirectory()) {
        walk(full, rp, depth + 1, out);
      } else if (en.isFile() && isAudio(en.name)) {
        let size = 0;
        try { size = fs.statSync(full).size; } catch (e) {}
        out.push({ name: en.name, path: rp, size, dir: rel });
      }
    }
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/music') {
      const tracks = [];
      walk(MUSIC_DIR, '', 0, tracks);
      return json(res, 200, { root: MUSIC_DIR, marked, tracks });
    }

    if (req.method === 'GET' && p === '/api/music/stream') {
      const rel = String(url.searchParams.get('path') || '').replace(/^\/+/, '');
      if (!rel) return json(res, 400, { error: 'no path' });
      const target = path.normalize(path.join(MUSIC_DIR, rel));
      const rootNorm = path.normalize(MUSIC_DIR);
      if (target !== rootNorm && !target.startsWith(rootNorm + path.sep)) {
        return json(res, 403, { error: 'outside music dir' });
      }
      try {
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'not found' });
      } catch (e) { return json(res, 404, { error: 'not found' }); }
      try {
        const stat = fs.statSync(target);
        const total = stat.size;
        const ext = String(rel).split('.').pop().toLowerCase();
        const ct = AUDIO_MIME[ext] || 'application/octet-stream';
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
          if (!(start >= 0) || isNaN(end) || end >= total) end = total - 1;
          if (start > end) return json(res, 416, { error: 'range not satisfiable' });
          res.writeHead(206, {
            'Content-Type': ct,
            'Content-Length': end - start + 1,
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
          });
          fs.createReadStream(target, { start, end }).pipe(res);
          return true;
        }
        res.writeHead(200, {
          'Content-Type': ct,
          'Content-Length': total,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        });
        fs.createReadStream(target).pipe(res);
        return true;
      } catch (e) { return res.end(); }
    }

    if (req.method === 'POST' && p === '/api/music/mark') {
      const body = JSON.parse(((await readBodySafe(req)) || '').toString() || '{}');
      marked[String(body.path || '')] = { star: Number(body.star) === 1 ? 1 : 0, ts: Date.now() };
      saveMarked();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/music/upload') {
      const name = String(url.searchParams.get('name') || '').replace(/^.*[\\/]/, '').trim();
      const ext = String(name).split('.').pop().toLowerCase();
      if (!name || !/^[^<>:"/\\|?*\u0000-\u001f]+$/.test(name)) return json(res, 400, { error: 'bad name' });
      if (!AUDIO_EXT[ext]) return json(res, 400, { error: 'not an audio file: .' + ext });
      const buf = await readBodySafe(req);
      if (!buf || !buf.length) return json(res, 400, { error: 'empty body' });
      const target = path.join(MUSIC_DIR, name);
      try { fs.mkdirSync(MUSIC_DIR, { recursive: true }); } catch (e) {}
      try {
        fs.writeFileSync(target, buf, { flag: 'w' });
      } catch (e) {
        return json(res, 500, { error: 'write failed: ' + e.message });
      }
      let size = 0;
      try { size = fs.statSync(target).size; } catch (e) {}
      return json(res, 200, { ok: true, name, size });
    }

    if ((req.method === 'DELETE' || req.method === 'POST') && p === '/api/music/delete') {
      const rel = req.method === 'DELETE'
        ? String(url.searchParams.get('path') || '').replace(/^\/+/, '')
        : String(((JSON.parse(((await readBodySafe(req)) || '').toString() || '{}')).path) || '').replace(/^\/+/, '');
      if (!rel) return json(res, 400, { error: 'no path' });
      const target = path.normalize(path.join(MUSIC_DIR, rel));
      const rootNorm = path.normalize(MUSIC_DIR);
      if (target !== rootNorm && !target.startsWith(rootNorm + path.sep)) {
        return json(res, 403, { error: 'outside music dir' });
      }
      try {
        if (!fs.existsSync(target)) return json(res, 404, { error: 'not found' });
        fs.unlinkSync(target);
        delete marked[String(rel)];
        saveMarked();
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 500, { error: 'delete failed: ' + e.message });
      }
    }

    return false;
  }

  async function readBodySafe(req) {
    return new Promise((resolveBody) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolveBody(Buffer.concat(chunks)));
      req.on('error', () => resolveBody(Buffer.alloc(0)));
    });
  }

  if (typeof fs.accessSync === 'function') {
    try { fs.accessSync(MUSIC_DIR); } catch (e) { try { fs.mkdirSync(MUSIC_DIR, { recursive: true }); } catch (e2) {} }
  }

  return { handle };
};