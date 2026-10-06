'use strict';

module.exports = (deps) => {
  const { dataDir, json, readBody, cfg } = deps;
  const fs = require('fs');
  const path = require('path');
  const net = require('net');
  const os = require('os');
  const http = require('http');
  const https = require('https');
  const { execFile } = require('child_process');

  const FILE = path.join(dataDir, 'smart.json');
  const EVENTS_MAX = 100;
  const HOSTS_MAX = 64;
  const PORTS = [1337, 6666, 6667, 6668, 1883, 54321, 80, 443, 8080, 8888];
  const HTTP_PORTS = [80, 443, 8080, 8888];
  const MIN_INTERVAL = 2000;
  const MAX_INTERVAL = 300000;

  const KINDS = [
    ['station', 'Станция Алисы'], ['lamp', 'Лампа'], ['plug', 'Розетка'], ['kettle', 'Чайник'],
    ['relay', 'Реле'], ['sensor', 'Датчик'], ['media', 'Медиа'], ['other', 'Прочее']
  ];
  const ADAPTER_LIST = [
    { id: 'manual', label: 'Ручное (состояние вручную)' },
    { id: 'webhook', label: 'Вебхук (устройство само шлёт состояние)' },
    { id: 'http', label: 'HTTP-мост (свой/чужой API)' },
    { id: 'glagol', label: 'Алиса, Glagol (LAN)', soon: 'этап 2' },
    { id: 'tuya', label: 'Tuya LAN', soon: 'этап 3' },
    { id: 'voice', label: 'Голос через станцию', soon: 'этап 3' },
    { id: 'mqtt', label: 'MQTT', soon: 'этап 3' }
  ];

  function defaults() {
    return { devices: [], scenes: [], poll: { enabled: false, interval: 5000 }, hosts: [], scanAt: 0 };
  }

  let store = defaults();
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (d && typeof d === 'object') store = Object.assign(defaults(), d);
  } catch (e) {}
  if (!Array.isArray(store.devices)) store.devices = [];
  if (!Array.isArray(store.scenes)) store.scenes = [];
  if (!Array.isArray(store.hosts)) store.hosts = [];
  store.poll = Object.assign({ enabled: false, interval: 5000 }, store.poll || {});
  store.poll.interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Number(store.poll.interval) || 5000));

  let events = [];
  let scanning = false;
  let ticking = false;
  let pollTimer = null;
  const clients = new Set();

  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch (e) {}
  }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function smartKey() {
    const c = typeof cfg === 'function' ? (cfg() || {}) : {};
    return String(process.env.KANBAN_SMART_KEY || (c.smart && c.smart.key) || '');
  }

  function isPrivateIp(ip) {
    ip = String(ip || '').replace(/^::ffff:/, '');
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  function keyOk(req, url) {
    const k = smartKey();
    if (!k) return isPrivateIp(req.socket.remoteAddress);
    const h = req.headers['x-smart-key'];
    const q = url && url.searchParams ? url.searchParams.get('key') : null;
    return h === k || q === k;
  }

  function emit(ev) {
    ev.ts = ev.ts || Date.now();
    ev.id = ev.id || uid('se_');
    events.unshift(ev);
    if (events.length > EVENTS_MAX) events.length = EVENTS_MAX;
    const line = 'data: ' + JSON.stringify(ev) + '\n\n';
    for (const c of clients) { try { c.write(line); } catch (e) { clients.delete(c); } }
    return ev;
  }

  function findDevice(id) { return store.devices.find(d => d.id === id) || null; }
  function findByName(name) {
    const n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return null;
    return store.devices.find(d => String(d.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === n) ||
      store.devices.find(d => String(d.name || '').toLowerCase().includes(n)) || null;
  }

  function stateText(dev) {
    const s = dev.state || {};
    if (typeof s.on === 'boolean') {
      const extra = [];
      if (typeof s.brightness === 'number') extra.push(s.brightness + '%');
      if (typeof s.temperature === 'number') extra.push(s.temperature + '°');
      if (typeof s.power === 'number') extra.push(s.power + ' Вт');
      return (s.on ? 'вкл' : 'выкл') + (extra.length ? ' · ' + extra.join(' · ') : '');
    }
    const keys = Object.keys(s);
    if (!keys.length) return '—';
    return keys.slice(0, 4).map(k => k + '=' + s[k]).join(', ');
  }

  function describeChange(dev, from, to) {
    if (to && typeof to.on === 'boolean') return (to.on ? 'включено' : 'выключено');
    const a = Object.keys(from || {}).sort().join(',');
    const b = Object.keys(to || {}).sort().join(',');
    return a === b ? 'состояние обновлено' : 'состояние: ' + stateText(dev);
  }

  function applyState(dev, next, src) {
    if (!next || typeof next !== 'object') return false;
    const prev = Object.assign({}, dev.state || {});
    const merged = Object.assign({}, prev, next);
    const changed = JSON.stringify(prev) !== JSON.stringify(merged);
    dev.state = merged;
    dev.stateAt = Date.now();
    dev.online = true;
    if (!changed) return false;
    save();
    emit({
      type: 'smart', kind: 'state', deviceId: dev.id, name: dev.name, src,
      text: dev.name + ': ' + describeChange(dev, prev, merged),
      from: prev, to: merged
    });
    runScenes(dev, prev, merged);
    return true;
  }

  function setOffline(dev) {
    if (dev.online === false) return;
    dev.online = false;
    save();
    emit({ type: 'smart', kind: 'offline', deviceId: dev.id, name: dev.name, text: dev.name + ': недоступно' });
  }

  /* ---------------- адаптеры ---------------- */

  function manualCmd(dev, action, value) {
    const a = String(action || '').toLowerCase();
    if (a === 'on' || a === 'off') return { ok: true, state: { on: a === 'on' } };
    if (a === 'toggle') return { ok: true, state: { on: !(dev.state && dev.state.on) } };
    if (a === 'set') {
      if (value && typeof value === 'object') return { ok: true, state: value };
      if (value !== undefined) return { ok: true, state: { value } };
      return { error: 'нет данных для set' };
    }
    if (a === 'state') return { ok: true, state: value && typeof value === 'object' ? value : {} };
    return { error: 'действие не поддерживается: ' + action };
  }

  function request(method, urlStr, body, timeout) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(urlStr); } catch (e) { return reject(new Error('некорректный URL: ' + urlStr)); }
      const mod = u.protocol === 'https:' ? https : http;
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = mod.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        timeout: timeout || 3000,
        rejectUnauthorized: false,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}
      }, (r) => {
        let data = '';
        r.on('data', d => { if (data.length < 20000) data += d.toString('utf8'); });
        r.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch (e) {}
          resolve({ status: r.statusCode, text: data.slice(0, 4000), json: parsed });
        });
        r.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(new Error('timeout')); });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function httpPoll(dev) {
    const url = dev.meta && dev.meta.pollUrl;
    if (!url) return null;
    const r = await request('GET', url, undefined, 3000);
    if (r.status >= 400 || !r.json) return null;
    return typeof r.json.state === 'object' && r.json.state ? r.json.state : r.json;
  }

  async function httpCmd(dev, action, value) {
    const url = dev.meta && dev.meta.cmdUrl;
    if (!url) {
      const local = manualCmd(dev, action, value);
      if (local.error) return { error: 'у устройства не задан cmdUrl' };
      return local;
    }
    const r = await request('POST', url, { id: dev.id, name: dev.name, action, value }, 4000);
    if (r.status >= 500) return { error: 'мост ответил ' + r.status };
    if (r.json && typeof r.json.state === 'object' && r.json.state) return { ok: true, state: r.json.state };
    return { ok: true, state: manualCmd(dev, action, value).state || {} };
  }

  const ADAPTERS = {
    manual: { poll: null, cmd: manualCmd },
    webhook: { poll: null, cmd: httpCmd },
    http: { poll: httpPoll, cmd: httpCmd },
    glagol: { stub: 'Адаптер Glagol появится на этапе 2 (управление станцией в LAN).' },
    tuya: { stub: 'Адаптер Tuya LAN появится на этапе 3 (нужен локальный ключ устройства).' },
    voice: { stub: 'Голосовые команды станции появятся на этапе 3.' },
    mqtt: { stub: 'MQTT-адаптер появится на этапе 3 (нужен адрес брокера).' }
  };

  async function command(dev, action, value, opt) {
    const ad = ADAPTERS[dev.adapter] || ADAPTERS.manual;
    if (ad.stub) return { error: ad.stub, code: 501 };
    let res;
    try { res = await ad.cmd(dev, action, value); } catch (e) { return { error: e.message, code: 502 }; }
    if (!res) return { error: 'адаптер не ответил', code: 502 };
    if (res.error) return { error: res.error, code: res.code || 400 };
    if (res.state) applyState(dev, res.state, (opt && opt.fromScene) ? 'scene' : 'cmd');
    else save();
    emit({
      type: 'smart', kind: 'cmd', deviceId: dev.id, name: dev.name,
      text: dev.name + ': команда «' + action + '»' + (value !== undefined && value !== null ? ' (' + value + ')' : '')
    });
    return { ok: true, device: dev };
  }

  /* ---------------- сцены ---------------- */

  function triggerFires(scene, dev, prev, next) {
    const t = scene.trigger || {};
    if (t.type === 'time') {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      if (String(t.at || '').trim() !== hhmm) return false;
      if (scene.lastRun && Date.now() - scene.lastRun < 60000) return false;
      return true;
    }
    if (!dev || (t.deviceId && t.deviceId !== dev.id)) return false;
    const field = t.field || 'on';
    const a = prev ? prev[field] : undefined;
    const b = next ? next[field] : undefined;
    const op = t.op || 'change';
    if (op === 'change') return JSON.stringify(a) !== JSON.stringify(b);
    if (op === 'eq') return String(b) === String(t.value);
    if (op === 'ne') return String(b) !== String(t.value);
    if (op === 'gt') return Number(b) > Number(t.value);
    if (op === 'lt') return Number(b) < Number(t.value);
    if (op === 'rise') return a === false && b === true;
    if (op === 'fall') return a === true && b === false;
    return false;
  }

  const busyScenes = new Set();

  async function fireScene(scene, dev) {
    if (busyScenes.has(scene.id)) return;
    busyScenes.add(scene.id);
    scene.lastRun = Date.now();
    save();
    emit({ type: 'smart', kind: 'scene', sceneId: scene.id, text: 'Сцена: ' + (scene.name || 'без имени') });
    for (const act of (scene.actions || [])) {
      const target = act.deviceId ? findDevice(act.deviceId) : null;
      if (!target) continue;
      const r = await command(target, act.action || 'toggle', act.value, { fromScene: true });
      if (r.error) emit({ type: 'smart', kind: 'scene', text: 'Сцена «' + (scene.name || '') + '»: ' + r.error });
    }
    busyScenes.delete(scene.id);
  }

  function runScenes(dev, prev, next) {
    for (const s of store.scenes) {
      if (!s.enabled) continue;
      try { if (triggerFires(s, dev, prev, next)) fireScene(s, dev); } catch (e) {}
    }
  }

  function checkTimeScenes() {
    for (const s of store.scenes) {
      if (!s.enabled || !s.trigger || s.trigger.type !== 'time') continue;
      try { if (triggerFires(s, null, null, null)) fireScene(s, null); } catch (e) {}
    }
  }

  /* ---------------- опрос ---------------- */

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      checkTimeScenes();
      if (!store.poll.enabled) return;
      for (const dev of store.devices) {
        const ad = ADAPTERS[dev.adapter] || ADAPTERS.manual;
        if (typeof ad.poll !== 'function') continue;
        let st = null;
        try { st = await ad.poll(dev); } catch (e) { st = null; }
        if (st === null || st === undefined) setOffline(dev);
        else applyState(dev, st, 'poll');
      }
    } catch (e) {
      console.error('[smart] poll:', e.message);
    } finally {
      ticking = false;
    }
  }

  function restartTimer() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const ms = store.poll.enabled ? store.poll.interval : 30000;
    pollTimer = setInterval(tick, ms);
    if (pollTimer.unref) pollTimer.unref();
  }

  /* ---------------- сканер LAN ---------------- */

  function prefixOf(netmask) {
    const m = String(netmask || '').split('.');
    if (m.length !== 4) return 24;
    let bits = 0;
    for (const part of m) {
      let v = Number(part);
      if (!Number.isInteger(v) || v < 0 || v > 255) return 24;
      while (v & 128) { bits++; v = (v << 1) & 255; }
      if (v !== 0) break;
    }
    return Math.max(8, Math.min(32, bits));
  }

  function lanTargets() {
    const out = new Set();
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family !== 'IPv4' || n.internal) continue;
        const parts = String(n.address).split('.').map(Number);
        if (parts.length !== 4 || parts.some(x => !Number.isInteger(x) || x < 0 || x > 255)) continue;
        if (parts[0] === 169 && parts[1] === 254) continue;
        const prefix = n.netmask ? prefixOf(n.netmask) : 24;
        let count = Math.pow(2, 32 - prefix);
        if (count > 512) count = 256;
        const base = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
        const netBase = (Math.floor(base / count) >>> 0) * count;
        for (let i = 0; i < count; i++) {
          const addr = (netBase + i) >>> 0;
          if (addr === base) continue;
          out.add([(addr >>> 24) & 255, (addr >>> 16) & 255, (addr >>> 8) & 255, addr & 255].join('.'));
        }
      }
    }
    return Array.from(out);
  }

  function ping(ip) {
    return new Promise((resolve) => {
      execFile('ping', ['-c', '1', '-W', '1', ip], { timeout: 1600 }, (err) => resolve(!err));
    });
  }

  async function pool(items, conc, worker) {
    let idx = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(conc, items.length)) }, async () => {
      while (idx < items.length) {
        const it = items[idx++];
        try { await worker(it); } catch (e) {}
      }
    });
    await Promise.all(runners);
  }

  function probe(ip, port, timeout) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const s = net.createConnection({ host: ip, port });
      s.setTimeout(timeout || 500);
      s.on('connect', () => { s.destroy(); finish(true); });
      s.on('timeout', () => { s.destroy(); finish(false); });
      s.on('error', () => { try { s.destroy(); } catch (e) {} finish(false); });
    });
  }

  function httpBrief(ip, port, timeout) {
    return new Promise((resolve) => {
      const mod = port === 443 ? https : http;
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      let req;
      try {
        req = mod.request({
          host: ip, port, path: '/', method: 'GET', timeout: timeout || 800,
          rejectUnauthorized: false,
          headers: { 'User-Agent': 'Mozilla/5.0 kanban-smart', Accept: '*/*' }
        }, (r) => {
          let body = '';
          r.on('data', d => { if (body.length < 1200) body += d.toString('utf8'); });
          r.on('end', () => finish({
            status: r.statusCode,
            server: String(r.headers.server || '').slice(0, 60),
            body: body.slice(0, 1200)
          }));
          r.on('error', () => finish(null));
        });
      } catch (e) { return finish(null); }
      req.on('timeout', () => { try { req.destroy(); } catch (e) {} finish(null); });
      req.on('error', () => finish(null));
      req.end();
    });
  }

  function fingerprint(info) {
    const s = ((info.server || '') + ' ' + (info.body || '')).toLowerCase();
    const m = (info.body || '').match(/<title>([^<]{0,80})/i);
    const title = m ? m[1].trim() : '';
    const marks = [];
    if (/tuya|smart.?life|smartlife/.test(s)) marks.push('tuya');
    if (/philips hue|hue bridge/.test(s)) marks.push('hue');
    if (/espressif|esp8266|esp32/.test(s)) marks.push('esp');
    if (/xiaomi|miwifi|mi wifi/.test(s)) marks.push('xiaomi');
    if (/openwrt|luci/.test(s)) marks.push('openwrt');
    if (/sonoff|itead/.test(s)) marks.push('sonoff');
    if (/yandex/.test(s)) marks.push('yandex');
    if (/mqtt/.test(s)) marks.push('mqtt');
    if (/home assistant|hassio/.test(s)) marks.push('ha');
    return { marks, title, server: info.server || '' };
  }

  function suggestionsOf(host) {
    const out = [];
    const ports = host.ports || [];
    if (ports.includes(1337)) out.push({ kind: 'station', adapter: 'glagol', name: 'Алиса (станция)' });
    if (ports.some(p => p === 6666 || p === 6667 || p === 6668) || (host.marks || []).includes('tuya')) {
      out.push({ kind: 'plug', adapter: 'tuya', name: 'Tuya-устройство', soon: 'этап 3' });
    }
    if (ports.includes(1883) || (host.marks || []).includes('mqtt')) out.push({ kind: 'other', adapter: 'mqtt', name: 'MQTT-устройство', soon: 'этап 3' });
    if ((host.marks || []).includes('hue')) out.push({ kind: 'lamp', adapter: 'http', name: 'Philips Hue' });
    if ((host.marks || []).includes('ha')) out.push({ kind: 'other', adapter: 'http', name: 'Home Assistant' });
    if (HTTP_PORTS.some(p => ports.includes(p)) && !out.length) out.push({ kind: 'other', adapter: 'manual', name: host.ip });
    return out;
  }

  function neighMap() {
    return new Promise((resolve) => {
      execFile('ip', ['-o', 'neigh'], { timeout: 3000 }, (err, stdout) => {
        const map = {};
        if (!err && stdout) {
          for (const line of String(stdout).split('\n')) {
            const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+\S+\s+lladdr\s+([0-9a-f:]{11,17})/i);
            if (m) map[m[1]] = m[2].toLowerCase();
          }
        }
        resolve(map);
      });
    });
  }

  function startScan() {
    if (scanning) return false;
    const targets = lanTargets();
    if (!targets.length) return false;
    scanning = true;
    emit({ type: 'scan', phase: 'start', total: targets.length });
    (async () => {
      const found = new Map();
      const get = (ip) => {
        if (!found.has(ip)) found.set(ip, { ip, ports: [], marks: [], title: '', server: '', alive: false, ts: Date.now() });
        return found.get(ip);
      };
      let pingDone = 0;
      emit({ type: 'scan', phase: 'progress', stage: 'ping', done: 0, total: targets.length });
      await pool(targets, 64, async (ip) => {
        if (await ping(ip)) get(ip).alive = true;
        pingDone++;
        if (pingDone % 64 === 0 || pingDone === targets.length) {
          emit({ type: 'scan', phase: 'progress', stage: 'ping', done: pingDone, total: targets.length });
        }
      });
      let tcpDone = 0;
      await pool(targets, 64, async (ip) => {
        const open = await Promise.all(PORTS.map(p => probe(ip, p, 600).then(o => (o ? p : 0))));
        const ports = open.filter(Boolean);
        tcpDone++;
        if (ports.length) {
          const rec = get(ip);
          rec.ports = ports;
          for (const p of HTTP_PORTS) {
            if (!ports.includes(p)) continue;
            const info = await httpBrief(ip, p, 900);
            if (info) {
              const fp = fingerprint(info);
              rec.marks = fp.marks; rec.title = fp.title; rec.server = fp.server;
              break;
            }
          }
        }
        if (tcpDone % 32 === 0 || tcpDone === targets.length) {
          emit({ type: 'scan', phase: 'progress', stage: 'tcp', done: tcpDone, total: targets.length });
        }
      });
      const macs = await neighMap();
      const hosts = Array.from(found.values())
        .filter(h => h.alive || h.ports.length)
        .map(h => Object.assign({}, h, { mac: macs[h.ip] || '' }));
      hosts.sort((a, b) => b.ports.length - a.ports.length || Number(b.alive) - Number(a.alive) || a.ip.localeCompare(b.ip));
      const aliveSet = new Set(hosts.map(h => h.ip));
      store.hosts = hosts.slice(0, HOSTS_MAX);
      store.scanAt = Date.now();
      for (const dev of store.devices) {
        if (!dev.ip) continue;
        dev.online = aliveSet.has(dev.ip);
        if (macs[dev.ip] && !dev.mac) dev.mac = macs[dev.ip];
      }
      save();
      scanning = false;
      emit({
        type: 'scan', phase: 'done', total: targets.length, found: hosts.length,
        withPorts: hosts.filter(h => h.ports.length).length,
        hosts: store.hosts.slice(0, 32).map(h => ({
          ip: h.ip, ports: h.ports, mac: h.mac, title: h.title, alive: h.alive,
          suggest: suggestionsOf(h)
        }))
      });
      console.log('[smart] scan: живых ' + hosts.length + ' (из них с открытыми портами ' +
        hosts.filter(h => h.ports.length).length + ') из ' + targets.length + ' адресов');
    })().catch((e) => {
      scanning = false;
      emit({ type: 'scan', phase: 'error', text: e.message });
      console.error('[smart] scan error:', e.message);
    });
    return true;
  }

  function enrichOnline() {
    if (!store.scanAt || !store.hosts.length) return;
    const ips = new Set(store.hosts.map(h => h.ip));
    for (const dev of store.devices) {
      if (dev.ip) dev.online = ips.has(dev.ip);
    }
  }

  /* ---------------- API ---------------- */

  function publicDevices() {
    enrichOnline();
    return store.devices.map(d => ({
      id: d.id, name: d.name, kind: d.kind, adapter: d.adapter, ip: d.ip || '', port: d.port || '',
      mac: d.mac || '', notes: d.notes || '', meta: d.meta || {},
      state: d.state || {}, stateAt: d.stateAt || 0, online: d.online !== false,
      stub: (ADAPTERS[d.adapter] && ADAPTERS[d.adapter].stub) || ''
    }));
  }

  function addDevice(body) {
    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) return { error: 'нужно название устройства' };
    const adapter = ADAPTER_LIST.some(a => a.id === body.adapter) ? body.adapter : 'manual';
    const kind = KINDS.some(k => k[0] === body.kind) ? body.kind : 'other';
    const dev = body.id ? findDevice(body.id) : null;
    if (dev) {
      dev.name = name; dev.kind = kind; dev.adapter = adapter;
      dev.ip = String(body.ip || '').trim().slice(0, 40);
      dev.port = String(body.port || '').trim().slice(0, 12);
      dev.notes = String(body.notes || '').trim().slice(0, 200);
      dev.meta = body.meta && typeof body.meta === 'object' ? {
        cmdUrl: String(body.meta.cmdUrl || '').slice(0, 300),
        pollUrl: String(body.meta.pollUrl || '').slice(0, 300)
      } : (dev.meta || {});
      save();
      emit({ type: 'smart', kind: 'change', deviceId: dev.id, name: dev.name, text: 'Устройство обновлено: ' + dev.name });
      return { device: dev };
    }
    const nd = {
      id: uid('sm_'), name, kind, adapter,
      ip: String(body.ip || '').trim().slice(0, 40),
      port: String(body.port || '').trim().slice(0, 12),
      mac: String(body.mac || '').trim().slice(0, 20),
      notes: String(body.notes || '').trim().slice(0, 200),
      meta: body.meta && typeof body.meta === 'object' ? {
        cmdUrl: String(body.meta.cmdUrl || '').slice(0, 300),
        pollUrl: String(body.meta.pollUrl || '').slice(0, 300)
      } : {},
      state: {}, stateAt: 0, online: true, created: Date.now()
    };
    store.devices.push(nd);
    enrichOnline();
    save();
    emit({ type: 'smart', kind: 'change', deviceId: nd.id, name: nd.name, text: 'Устройство добавлено: ' + nd.name });
    return { device: nd };
  }

  function upsertScene(body) {
    const name = String(body.name || '').trim().slice(0, 60);
    const trigger = body.trigger && typeof body.trigger === 'object' ? body.trigger : null;
    if (!trigger) return { error: 'нужен триггер' };
    if (trigger.type === 'time') {
      if (!/^\d{1,2}:\d{2}$/.test(String(trigger.at || ''))) return { error: 'время нужно в формате ЧЧ:ММ' };
    } else if (!trigger.deviceId || !findDevice(trigger.deviceId)) return { error: 'нужно устройство-триггер' };
    const actions = (Array.isArray(body.actions) ? body.actions : []).slice(0, 6)
      .filter(a => a && a.deviceId && findDevice(a.deviceId))
      .map(a => ({ deviceId: a.deviceId, action: String(a.action || 'toggle').slice(0, 20), value: a.value }));
    if (!actions.length) return { error: 'нужно хотя бы одно действие' };
    const sc = body.id ? store.scenes.find(s => s.id === body.id) : null;
    if (sc) {
      sc.name = name; sc.trigger = trigger; sc.actions = actions;
      if (body.enabled !== undefined) sc.enabled = !!body.enabled;
      save();
      return { scene: sc };
    }
    const ns = { id: uid('sc_'), name, enabled: body.enabled !== false, trigger, actions, lastRun: 0 };
    store.scenes.push(ns);
    save();
    emit({ type: 'smart', kind: 'scene', sceneId: ns.id, text: 'Сцена создана: ' + ns.name });
    return { scene: ns };
  }

  async function handle(p, url, req, res) {
    if (!p.startsWith('/api/smart')) return false;

    if (req.method === 'GET' && p === '/api/smart/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      for (const ev of events.slice().reverse()) {
        res.write('data: ' + JSON.stringify(Object.assign({ replay: true }, ev)) + '\n\n');
      }
      res.write(':hist\n\n');
      clients.add(res);
      const timer = setInterval(() => { try { res.write(':k\n\n'); } catch (e) { clearInterval(timer); } }, 25000);
      req.on('close', () => { clearInterval(timer); clients.delete(res); });
      return true;
    }

    if (req.method === 'GET' && p === '/api/smart') {
      return json(res, 200, {
        devices: publicDevices(),
        scenes: store.scenes,
        poll: store.poll,
        hosts: store.hosts.map(h => ({
          ip: h.ip, ports: h.ports, mac: h.mac, title: h.title, marks: h.marks, alive: h.alive,
          suggest: suggestionsOf(h), ts: h.ts
        })),
        scanAt: store.scanAt, scanning,
        events: events.slice(0, 50),
        kinds: KINDS, adapters: ADAPTER_LIST,
        key: !!smartKey()
      });
    }

    if (req.method !== 'POST') return json(res, 404, { error: 'not found' });

    if (!keyOk(req, url)) {
      return json(res, smartKey() ? 401 : 403, { error: smartKey() ? 'bad key' : 'только из локальной сети' });
    }

    let body = {};
    try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}

    if (p === '/api/smart/scan') {
      const ok = startScan();
      return json(res, ok ? 202 : 409, { ok, scanning, error: ok ? undefined : (scanning ? 'сканирование уже идёт' : 'нет сетевых интерфейсов') });
    }

    if (p === '/api/smart/cmd') {
      const dev = body.id ? findDevice(body.id) : findByName(body.name || body.device);
      if (!dev) return json(res, 404, { error: 'устройство не найдено' });
      const r = await command(dev, String(body.action || '').toLowerCase(), body.value);
      if (r.error) return json(res, r.code || 400, { error: r.error });
      return json(res, 200, { ok: true, device: dev, state: dev.state || {}, stateText: stateText(dev) });
    }

    if (p === '/api/smart/device') {
      const r = addDevice(body);
      if (r.error) return json(res, 400, { error: r.error });
      return json(res, 200, { ok: true, device: r.device });
    }

    let m = p.match(/^\/api\/smart\/device\/([^/]+)\/(delete|update)$/);
    if (m) {
      const dev = findDevice(m[1]);
      if (!dev) return json(res, 404, { error: 'устройство не найдено' });
      if (m[2] === 'delete') {
        store.devices = store.devices.filter(d => d.id !== dev.id);
        save();
        emit({ type: 'smart', kind: 'change', deviceId: dev.id, name: dev.name, text: 'Устройство удалено: ' + dev.name });
        return json(res, 200, { ok: true });
      }
      const r = addDevice(Object.assign({}, dev, body, { id: dev.id }));
      if (r.error) return json(res, 400, { error: r.error });
      return json(res, 200, { ok: true, device: r.device });
    }

    if (p === '/api/smart/poll') {
      const on = body.enabled === undefined ? store.poll.enabled : !!body.enabled;
      const iv = Number(body.interval);
      store.poll.enabled = on;
      if (Number.isFinite(iv) && iv > 0) store.poll.interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, iv));
      save();
      restartTimer();
      return json(res, 200, { ok: true, poll: store.poll });
    }

    if (p === '/api/smart/scene') {
      const r = upsertScene(body);
      if (r.error) return json(res, 400, { error: r.error });
      return json(res, 200, { ok: true, scene: r.scene });
    }

    m = p.match(/^\/api\/smart\/scene\/([^/]+)\/(delete|toggle|run)$/);
    if (m) {
      const sc = store.scenes.find(s => s.id === m[1]);
      if (!sc) return json(res, 404, { error: 'сцена не найдена' });
      if (m[2] === 'delete') {
        store.scenes = store.scenes.filter(s => s.id !== sc.id);
        save();
        return json(res, 200, { ok: true });
      }
      if (m[2] === 'toggle') {
        sc.enabled = !sc.enabled;
        save();
        return json(res, 200, { ok: true, scene: sc });
      }
      await fireScene(sc, null);
      return json(res, 200, { ok: true, scene: sc });
    }

    m = p.match(/^\/api\/smart\/webhook\/([^/]+)$/);
    if (m) {
      const dev = findDevice(m[1]) || findByName(decodeURIComponent(url.searchParams.get('name') || ''));
      if (!dev) return json(res, 404, { error: 'устройство не найдено' });
      let next = body && typeof body === 'object' ? body : {};
      if (next.state && typeof next.state === 'object') next = next.state;
      if (!Object.keys(next).length) {
        next = {};
        for (const [k, v] of url.searchParams) {
          if (k === 'key' || k === 'name') continue;
          next[k] = v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
        }
      }
      if (!Object.keys(next).length) return json(res, 400, { error: 'пустое состояние' });
      applyState(dev, next, 'webhook');
      return json(res, 200, { ok: true, state: dev.state });
    }

    return json(res, 404, { error: 'not found' });
  }

  function contextSummary() {
    if (!store.devices.length) return '';
    const lines = store.devices.slice(0, 12).map(d =>
      (d.online === false ? '🔴 ' : '🟢 ') + d.name + ' — ' + stateText(d));
    return '\n\nУстройства умного дома пользователя (последнее известное состояние):\n' + lines.join('\n') +
      '\nУправлять: node ' + path.join(__dirname, 'assist-cli.js') + ' smart on "имя устройства" (off/toggle/scan/list).' +
      ' Или прямо в чате попроси включить/выключить устройство — команда выполнится на сервере.';
  }

  enrichOnline();
  restartTimer();

  return {
    handle,
    contextSummary,
    list: publicDevices,
    add: addDevice,
    cmd: (name, action, value) => {
      const dev = findByName(name);
      if (!dev) return { error: 'устройство не найдено: ' + name };
      return command(dev, action, value);
    },
    scan: startScan,
    stop() { if (pollTimer) clearInterval(pollTimer); }
  };
};
