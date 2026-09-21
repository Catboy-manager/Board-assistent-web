'use strict';

const { spawn } = require('child_process');

/* Веб-консоль сервера: один PTY-шелл (util-linux `script` → /bin/bash).
   Доступом управляет функция allowed(), передаваемая из server.js
   (loopback по умолчанию, либо ключ consoleKey/KANBAN_CONSOLE_KEY). */
module.exports = (deps) => {
  const { json, readBody, allowed, getKey } = deps;

  let proc = null;
  const clients = new Set();

  function isLan(addr) {
    if (!addr) return false;
    const s = String(addr).replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const [a, b] = m.slice(1).map(Number);
    if (s === '127.0.0.1') return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  function broadcast(obj) {
    const data = 'data: ' + JSON.stringify(obj) + '\n\n';
    for (const c of clients) {
      try { c.write(data); } catch (e) { clients.delete(c); }
    }
  }

  function stripAnsi(s) {
    return String(s)
      .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b[()][0-9a-zA-Z]/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  }

  function ensure() {
    if (proc) return true;
    try {
      proc = spawn('/usr/bin/script', ['-qfec', 'stty cols 120 rows 33; exec /bin/bash', '/dev/null'], {
        env: Object.assign({}, process.env, {
          TERM: 'xterm-256color', COLUMNS: '120', LINES: '33', PS1: '\\u@\\h:\\w$ '
        })
      });
      proc.stdout.on('data', d => broadcast({ type: 'out', data: stripAnsi(d.toString('utf8')) }));
      proc.stderr.on('data', d => broadcast({ type: 'out', data: d.toString('utf8') }));
      proc.on('close', code => { proc = null; broadcast({ type: 'exit', code }); });
      proc.on('error', () => { proc = null; broadcast({ type: 'exit', error: true }); });
      broadcast({ type: 'start' });
      return true;
    } catch (e) {
      return false;
    }
  }

  function stop() {
    if (proc) { try { proc.kill('SIGKILL'); } catch (e) {} proc = null; }
  }

  async function handle(p, url, req, res) {
    if (!p.startsWith('/api/console')) return false;
    if (p === '/api/console/key') {
      const k = getKey ? getKey() : '';
      if (!k) return json(res, 200, { key: '' });
      if (!isLan(req.socket && req.socket.remoteAddress)) {
        return json(res, 403, { error: 'ключ консоли доступен только из локальной сети' });
      }
      return json(res, 200, { key: k });
    }
    if (!allowed(req)) return json(res, 403, { error: 'console закрыта (loopback или consoleKey)' });

    if (req.method === 'GET' && p === '/api/console/state') {
      return json(res, 200, { running: !!proc, clients: clients.size });
    }
    if (req.method === 'POST' && p === '/api/console/input') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const data = String(body.data || '');
      if (data === '\u0004') { stop(); return json(res, 200, { ok: true }); }
      if (!ensure()) return json(res, 500, { error: 'cannot start shell' });
      if (proc && proc.stdin && proc.stdin.writable) {
        try { proc.stdin.write(data); } catch (e) {}
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/console/restart') {
      stop();
      setTimeout(() => ensure(), 300);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/api/console/events') {
      if (!ensure()) return json(res, 500, { error: 'cannot start shell' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      clients.add(res);
      const timer = setInterval(() => { try { res.write(':k\n\n'); } catch (e) { clearInterval(timer); } }, 20000);
      req.on('close', () => { clearInterval(timer); clients.delete(res); });
      return true;
    }
    return false;
  }

  return { handle };
};