'use strict';

module.exports = (deps) => {
  const { dataDir, json } = deps;
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const FILE = path.join(dataDir, 'notify.json');
  const HISTORY_MAX = 50;

  let history = [];
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); history = (d && d.history) || []; } catch (e) {}

  const clients = new Set();

  const NOTIFY_KEY = process.env.KANBAN_NOTIFY_KEY || '';

  function saveHistory() {
    try { fs.writeFileSync(FILE, JSON.stringify({ history }, null, 2)); } catch (e) {}
  }

  function addNotify(item) {
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
      if (!keyOk(req, url)) return json(res, 401, { error: 'bad key' });
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const title = String(body.title || '').trim();
      const text = String(body.text || body.body || '').trim();
      const app = String(body.app || body.source || 'Телефон').trim().slice(0, 40);
      if (!title && !text) return json(res, 400, { error: 'required: title or text' });
      const rec = addNotify({ title: title.slice(0, 160), text: text.slice(0, 500), app });
      return json(res, 200, { ok: true, id: rec.id });
    }

    if (req.method === 'GET' && p === '/api/notify/history') {
      return json(res, 200, { history: history.slice(0, 20) });
    }

    if (req.method === 'GET' && p === '/api/notify/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      for (const rec of history.slice(0, 20)) {
        res.write('data: ' + JSON.stringify({ type: 'phone', item: rec }) + '\n\n');
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