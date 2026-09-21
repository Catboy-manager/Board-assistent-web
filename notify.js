'use strict';

module.exports = (deps) => {
  const { dataDir, json } = deps;
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const FILE = path.join(dataDir, 'notify.json');
  const HISTORY_MAX = 500;

  let history = [];
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); history = (d && d.history) || []; } catch (e) {}

  const IGNORED_APPS = String(process.env.KANBAN_NOTIFY_IGNORE || 'downloads,youtube morphe')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  function isIgnored(item) {
    return IGNORED_APPS.includes(String(item && item.app || '').trim().toLowerCase());
  }
  const keptBefore = history.length;
  history = history.filter(r => !isIgnored(r));
  if (history.length !== keptBefore) saveHistory();

  const clients = new Set();

  const NOTIFY_KEY = process.env.KANBAN_NOTIFY_KEY || '';

  function saveHistory() {
    try { fs.writeFileSync(FILE, JSON.stringify({ history }, null, 2)); } catch (e) {}
  }

  function addNotify(item) {
    if (isIgnored(item)) return null;
    const rec = Object.assign({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, item);
    history.unshift(rec);
    if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
    saveHistory();
    for (const c of clients) {
      try { c.write('data: ' + JSON.stringify({ type: 'phone', item: rec }) + '\n\n'); } catch (e) { clients.delete(c); }
    }
    return rec;
  }

  function readBody(req) {
    return new Promise((resolveBody) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolveBody(Buffer.concat(chunks)));
      req.on('error', () => resolveBody(Buffer.alloc(0)));
    });
  }

  function keyOk(req, url) {
    if (!NOTIFY_KEY) return true;
    const h = req.headers['x-notify-key'];
    const q = url && url.searchParams ? url.searchParams.get('key') : null;
    return h === NOTIFY_KEY || q === NOTIFY_KEY;
  }

  async function handle(p, url, req, res) {
    if (req.method === 'POST' && p === '/api/notify/send') {
      if (!keyOk(req, url)) {
        console.log('[notify] 401 key (' + String(req.headers['x-notify-key'] || 'нет') + ')');
        return json(res, 401, { error: 'bad key' });
      }
      let body = {};
      const raw = ((await readBody(req)) || '').toString();
      console.log('[notify] POST ctype=' + String(req.headers['content-type'] || '?') +
        ' ip=' + (req.socket.remoteAddress || '?') + ' body[' + raw.length + '] ' + raw.slice(0, 200));
      const ctype = String(req.headers['content-type'] || '').toLowerCase();
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || ctype.includes('json')) {
        try { body = JSON.parse(trimmed || '{}'); } catch (e) {}
      }
      if (!(body.title || body.text)) {
        if (ctype.includes('application/x-www-form-urlencoded') || trimmed.includes('&') || trimmed.includes('=')) {
          for (const pair of trimmed.split('&')) {
            if (!pair) continue;
            const eq = pair.indexOf('=');
            const k = eq < 0 ? pair : pair.slice(0, eq);
            const v = eq < 0 ? '' : pair.slice(eq + 1);
            try { body[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e2) {}
          }
        }
      }
      if (!(body.title || body.text)) {
        try { body = JSON.parse(trimmed || '{}'); } catch (e) {}
      }
      const title = String(body.title || '').trim();
      const text = String(body.text || body.body || '').trim();
      const app = String(body.app || body.source || 'Телефон').trim().slice(0, 40);
      if (!title && !text) return json(res, 400, { error: 'required: title or text' });
      const rec = addNotify({ title: title.slice(0, 160), text: text.slice(0, 500), app });
      if (rec) return json(res, 200, { ok: true, id: rec.id });
      return json(res, 200, { ok: true, ignored: true });
    }

    if (req.method === 'GET' && p === '/api/notify/history') {
      const ql = parseInt(url.searchParams.get('limit') || '0', 10);
      const limit = ql > 0 ? Math.min(ql, HISTORY_MAX) : history.length;
      return json(res, 200, { history: history.slice(0, limit) });
    }

    if (req.method === 'GET' && p === '/api/notify/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      for (const rec of history.slice(0, 20)) {
        res.write('data: ' + JSON.stringify({ type: 'phone', item: rec, replay: true }) + '\n\n');
      }
      res.write(':hist\n\n');
      clients.add(res);
      const timer = setInterval(() => { try { res.write(':k\n\n'); } catch (e) { clearInterval(timer); } }, 25000);
      req.on('close', () => { clearInterval(timer); clients.delete(res); });
      return true;
    }

    return false;
  }

  return { handle };
};