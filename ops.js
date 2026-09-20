'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

module.exports = (deps) => {
  const { dataDir, json } = deps;

  const FILE = path.join(dataDir, 'ops.json');
  const OPS_STORE = 40;

  const CR = String.fromCharCode(10);

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nowTs() { return Date.now(); }
  function foldLines(parts) { return parts.join(CR + CR); }

  let ops = [];
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (d && Array.isArray(d.ops)) ops = d.ops; } catch (e) {}

  const aiBuckets = [];
  let aiTotal = 0, aiAborted = 0, aiMsSum = 0;
  let aiLast = null, aiNow = null;

  function save() { try { fs.writeFileSync(FILE, JSON.stringify({ ops }, null, 2)); } catch (e) {} }

  function aiBucket() {
    const t0 = Math.floor(nowTs() / 60000);
    let b = aiBuckets.length ? aiBuckets[aiBuckets.length - 1] : null;
    if (!b || b.t0 !== t0) {
      b = { t0, n: 0 };
      aiBuckets.push(b);
      if (aiBuckets.length > 60) aiBuckets.shift();
    }
    return b;
  }

  function push(rec) {
    const full = Object.assign({ id: rec.id || 'op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: nowTs() }, rec);
    ops.unshift(full);
    if (ops.length > OPS_STORE) ops = ops.slice(0, OPS_STORE);
    save();
    ssePush({ type: 'op', item: full });
    return full;
  }

  function recordAi(model, ms, ok, stats) {
    const b = aiBucket();
    b.n++;
    aiTotal++;
    if (!ok) aiAborted++;
    if (ms > 0) aiMsSum += ms;
    aiNow = { ts: nowTs(), model: model, ms: ms, ok: ok };
    const parts = [String(model || 'big-pickle')];
    const tokens = stats && stats.tokens;
    if (tokens && tokens > 0) {
      parts.push(tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k ток' : String(tokens) + ' ток');
    }
    if (ms >= 1000) parts.push((ms / 1000).toFixed(1) + ' с');
    else if (ms > 0) parts.push(Math.round(ms || 0) + ' мс');
    const cost = stats && stats.cost;
    if (cost && cost > 0.004) parts.push('$' + cost.toFixed(2));
    const rec = {
      id: 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      icon: ok ? '1F9E0' : '2757',
      app: 'Big Pickle',
      title: (ok ? 'Запрос к нейросети' : 'Сбой запроса к нейросети'),
      text: esc(parts.join(' · '))
    };
    return push(rec);
  }

  function recordOp(rec) {
    return push(Object.assign({ app: 'opencode' }, rec));
  }

  let diskCache = null, diskTs = 0, diskBusy = false;

  function readDisk() {
    return new Promise((resolveDisk) => {
      if (diskBusy) return resolveDisk(diskCache);
      diskBusy = true;
      execFile('df', ['-Pk', '/'], { timeout: 6000 }, (err, out) => {
        diskBusy = false;
        try {
          if (err || !out) return resolveDisk(diskCache);
          const line = String(out).split(String.fromCharCode(10))[1];
          const parts = line ? line.trim().split(/[ \t]+/) : [];
          if (parts.length < 5) return resolveDisk(diskCache);
          diskCache = {
            size: +parts[1] * 1024,
            used: +parts[2] * 1024,
            avail: +parts[3] * 1024
          };
          diskTs = nowTs();
          return resolveDisk(diskCache);
        } catch (e) { return resolveDisk(diskCache); }
      });
    });
  }

  function memNow() {
    const m = process.memoryUsage();
    return {
      rss: m.rss,
      total: os.totalmem(),
      free: os.freemem(),
      pct: os.totalmem() ? Math.round((m.rss / os.totalmem()) * 100) : 0
    };
  }

  function loadAvg() { return os.loadavg().map(x => Math.round(x * 100) / 100); }

  function tempC() {
    for (const z of ['thermal_zone0', 'thermal_zone1']) {
      try {
        const p = '/sys/class/thermal/' + z + '/temp';
        if (!fs.existsSync(p)) continue;
        const c = (+fs.readFileSync(p, 'utf8').trim()) / 1000;
        if (isFinite(c) && c > 0 && c < 120) return { c: Math.round(c * 10) / 10, zone: z };
      } catch (e) {}
    }
    return null;
  }

  async function resSnap() {
    const disk = await readDisk();
    const mem = memNow();
    const load = loadAvg();
    const temp = tempC();
    return { ts: nowTs(), disk, mem, load, temp, up: os.uptime() };
  }

  let sseClients = new Set();

  function sseWrite(c, obj) {
    try { c.write('data: ' + JSON.stringify(obj) + CR + CR); } catch (e) { sseClients.delete(c); }
  }
  function ssePush(obj) {
    for (const c of sseClients) sseWrite(c, obj);
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/ops/status') {
      return json(res, 200, {
        ops: ops,
        ai: { total: aiTotal, aborted: aiAborted, last: aiNow, buckets: aiBuckets.slice(-60), msSum: aiMsSum },
        res: await resSnap()
      });
    }
    if (req.method === 'GET' && p === '/api/ops/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok' + CR + CR);
      for (const rec of ops.slice(0, 20)) sseWrite(res, { type: 'op', item: rec, replay: true });
      res.write(':hist' + CR + CR);
      sseClients.add(res);
      const t0 = setInterval(async () => {
        try { sseWrite(res, { type: 'res', item: await resSnap() }); } catch (e) { clearInterval(t0); }
      }, 9000);
      const keep = setInterval(() => { try { res.write(':k' + CR + CR); } catch (e) { clearInterval(keep); } }, 25000);
      req.on('close', () => { clearInterval(t0); clearInterval(keep); sseClients.delete(res); });
      return true;
    }
    return false;
  }

  setInterval(() => { resSnap().then(x => ssePush({ type: 'res', item: x })).catch(() => {}); }, 21000);

  return { handle, recordAi, recordOp };
};
