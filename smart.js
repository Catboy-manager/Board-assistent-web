'use strict';

module.exports = (deps) => {
  const { dataDir, json, readBody, cfg } = deps;
  const fs = require('fs');
  const path = require('path');
  const net = require('net');
  const tls = require('tls');
  const os = require('os');
  const http = require('http');
  const https = require('https');
  const dgram = require('dgram');
  const crypto = require('crypto');
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
    { id: 'glagol', label: 'Алиса, Glagol (LAN + облако Яндекса)' },
    { id: 'tuya', label: 'Tuya LAN', soon: 'этап 3' },
    { id: 'voice', label: 'Голос через станцию', soon: 'этап 3' },
    { id: 'mqtt', label: 'MQTT', soon: 'этап 3' }
  ];

  /* Яндекс Станция: известные платформы для названий в обзоре */
  const YANDEX_PLATFORMS = {
    yandexstation: ['Яндекс', 'Станция (2018)'], yandexstation_2: ['Яндекс', 'Станция Макс (2020)'],
    yandexmini: ['Яндекс', 'Станция Мини (2019)'], yandexmini_2: ['Яндекс', 'Станция Мини 2 (2021)'],
    bergamot: ['Яндекс', 'Станция Мини 3 (2024)'], yandexmicro: ['Яндекс', 'Станция Лайт (2021)'],
    plum: ['Яндекс', 'Станция Лайт 2 (2024)'], yandexmidi: ['Яндекс', 'Станция 2 (2022)'],
    cucumber: ['Яндекс', 'Станция Миди (2023)'], chiron: ['Яндекс', 'Станция Дуо Макс (2023)'],
    orion: ['Яндекс', 'Станция 3 (2025)'], mango: ['Яндекс', 'Станция Стрит (2025)'],
    yandexmodule: ['Яндекс', 'Модуль (2019)'], yandexmodule_2: ['Яндекс', 'Модуль 2 (2021)'],
    yandex_tv: ['Яндекс', 'ТВ с Алисой'], goya: ['Яндекс', 'ТВ (2022)'],
    magritte: ['Яндекс', 'ТВ Станция LED (2023)'], magritte_2: ['Яндекс', 'ТВ Станция QLED (2025)'],
    monet: ['Яндекс', 'ТВ Станция Бейсик LED (2024)'], monet_2: ['Яндекс', 'ТВ Станция Бейсик QLED (2025)'],
    levitan: ['Яндекс', 'ТВ Станция MiniLED (2026)'], malevich: ['Яндекс', 'ТВ Станция Про MiniLED (2025)'],
    saturn: ['Яндекс', 'Хаб (2023)']
  };
  const YANDEX_TV_KEYS = new Set(['yandex_tv', 'goya', 'magritte', 'magritte_2', 'monet', 'monet_2', 'levitan', 'malevich']);
  const IOT_TYPES = {
    on: 'devices.capabilities.on_off', volume: 'devices.capabilities.range',
    brightness: 'devices.capabilities.range', temperature: 'devices.capabilities.range',
    color: 'devices.capabilities.color_setting', mute: 'devices.capabilities.toggle',
    pause: 'devices.capabilities.toggle', channel: 'devices.capabilities.range',
    input_source: 'devices.capabilities.mode', fan_speed: 'devices.capabilities.mode',
    keep_warm: 'devices.capabilities.toggle', ionization: 'devices.capabilities.toggle',
    work_speed: 'devices.capabilities.mode', swing: 'devices.capabilities.mode'
  };
  const TOKEN_FILE = path.join(dataDir, 'yandex-token.txt');
  const YA_AUTH_FILE = path.join(dataDir, 'yandex-auth.json');
  const PASSPORT_CLIENT_ID = 'c0ebe342af7d48fbbbfcf2d2eedb8f9e';
  const PASSPORT_CLIENT_SECRET = 'ad0a908f0aa341a182a37ecd75bc319e';
  const DEVICE_CODE_URL = 'https://oauth.yandex.ru/device/code';
  const OAUTH_TOKEN_URL = 'https://oauth.yandex.ru/token';
  /* публичный клиент «Яндекс Музыки» — нужен для обмена x_token на music-токен (доступ к glagol) */
  const MUSIC_CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d';
  const MUSIC_CLIENT_SECRET = '53bc75238f0c4d08a118e51fe9203300';
  const YA_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

  function request(method, urlStr, body, timeout, hdr) {
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
        headers: Object.assign(
          payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
          hdr || {}
        )
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

  /* ---------------- Яндекс (Glagol): токен, облако, локальный WS ---------------- */

  let yaDevices = null;
  let yaTokenCache = null;
  let yaMusicCache = null;
  let yaSession = null; // { cookies, ts }

  function yandexToken() {
    if (yaTokenCache !== null) return yaTokenCache;
    const env = process.env.KANBAN_YANDEX_TOKEN;
    if (env) return (yaTokenCache = env);
    try { yaTokenCache = String(fs.readFileSync(TOKEN_FILE, 'utf8')).trim(); } catch (e) { yaTokenCache = ''; }
    return yaTokenCache;
  }

  function setYandexToken(token) {
    yaTokenCache = String(token || '').trim();
    yaMusicCache = null;
    yaSession = null;
    yaDevices = null;
    try {
      if (yaTokenCache) fs.writeFileSync(TOKEN_FILE, yaTokenCache, { mode: 0o600 });
      else { try { fs.unlinkSync(TOKEN_FILE); } catch (e) {} }
      return true;
    } catch (e) { return false; }
  }

  function yaReq(method, urlStr, body, timeout) {
    const t = yandexToken();
    return request(method, urlStr, body, timeout || 5000, t ? { Authorization: 'OAuth ' + t } : {});
  }

  function yaNeeded() {
    return { error: 'Нужен токен Яндекса (OAuth x_token): POST /api/smart/config {yandexToken} или KANBAN_YANDEX_TOKEN в окружении', code: 501 };
  }

  /* вход по QR (OAuth device flow, RFC 8628; клиент — публичный из Android-приложений Яндекса) */
  function postForm(urlStr, fields) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(urlStr); } catch (e) { return reject(new Error('некорректный URL: ' + urlStr)); }
      const payload = Buffer.from(Object.entries(fields).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&'));
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
        timeout: 8000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': payload.length }
      }, (r) => {
        let data = '';
        r.on('data', d => { if (data.length < 20000) data += d; });
        r.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (e) {} resolve({ status: r.statusCode, json, text: data.slice(0, 2000) }); });
        r.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /* --- получение music-токена (нужен для quasar.yandex.net/glagol/token) --- */
  async function yaMusicToken() {
    if (yaMusicCache) return yaMusicCache;
    const x = yandexToken();
    if (!x) return '';
    try {
      const r = await postForm('https://oauth.mobile.yandex.net/1/token', {
        client_secret: MUSIC_CLIENT_SECRET, client_id: MUSIC_CLIENT_ID,
        grant_type: 'x-token', access_token: x
      });
      if (r.json && r.json.access_token) return (yaMusicCache = r.json.access_token);
    } catch (e) {}
    return '';
  }

  /* --- cookie-сессия паспорта из x_token (для iot.quasar.yandex.ru) --- */
  function rawRequest(method, urlStr, bodyBuf, hdr, timeout) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(urlStr); } catch (e) { return reject(new Error('некорректный URL: ' + urlStr)); }
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request({
        hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search, method, timeout: timeout || 9000, rejectUnauthorized: false,
        headers: Object.assign({ 'User-Agent': YA_UA }, hdr || {})
      }, (r) => {
        let data = '';
        r.on('data', d => { if (data.length < 40000) data += d.toString('utf8'); });
        r.on('end', () => {
          let json = null; try { json = JSON.parse(data); } catch (e) {}
          resolve({ status: r.statusCode, headers: r.headers, text: data.slice(0, 4000), json });
        });
        r.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  async function yaSessionLogin() {
    const x = yandexToken();
    if (!x) return null;
    const jar = {};
    const absorb = (h) => {
      let sc = h && h['set-cookie'];
      if (!sc) return;
      if (!Array.isArray(sc)) sc = [sc];
      for (const c of sc) { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
    };
    const cookieStr = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    try {
      let r = await rawRequest('POST', 'https://mobileproxy.passport.yandex.net/1/bundle/auth/x_token/',
        Buffer.from('type=x-token&retpath=' + encodeURIComponent('https://www.yandex.ru')),
        { 'Content-Type': 'application/x-www-form-urlencoded', 'Ya-Consumer-Authorization': 'OAuth ' + x }, 10000);
      absorb(r.headers);
      if (!r.json || !r.json.track_id) return null;
      const host = r.json.passport_host || 'https://passport.yandex.ru';
      let url = host + '/auth/session/?track_id=' + encodeURIComponent(r.json.track_id);
      for (let i = 0; i < 6 && url; i++) {
        r = await rawRequest('GET', url, undefined, { Cookie: cookieStr(), 'User-Agent': YA_UA, Accept: 'text/html' }, 10000);
        absorb(r.headers);
        const loc = r.headers && r.headers.location;
        url = loc ? (loc.startsWith('http') ? loc : (loc.startsWith('/') ? host + loc : null)) : null;
      }
      const c = cookieStr();
      return c || null;
    } catch (e) { return null; }
  }

  async function yaSessionCookies(force) {
    if (!force && yaSession && Date.now() - yaSession.ts < 600000) return yaSession.cookies;
    const c = await yaSessionLogin();
    yaSession = c ? { cookies: c, ts: Date.now() } : null;
    return c ? c : null;
  }

  async function yaSessionReq(method, urlStr, body, timeout) {
    const cookies = await yaSessionCookies(false);
    if (!cookies) return { status: 0, json: null, text: '' };
    return request(method, urlStr, body, timeout || 9000, { Cookie: cookies, 'User-Agent': YA_UA });
  }

  let yaAuth = null; // { device_code, user_code, verification_url, ts, expires_in, delay, state }
  let yaTimer = null;

  function logAuth(msg) { console.log('[smart] auth: ' + msg); }

  function clearYaTimer() { if (yaTimer) { clearTimeout(yaTimer); yaTimer = null; } }

  function authSave() {
    if (!yaAuth) { try { fs.unlinkSync(YA_AUTH_FILE); } catch (e) {} return; }
    try { fs.writeFileSync(YA_AUTH_FILE, JSON.stringify({
      device_code: yaAuth.device_code, user_code: yaAuth.user_code,
      verification_url: yaAuth.verification_url, ts: yaAuth.ts,
      expires_in: yaAuth.expires_in, delay: yaAuth.delay, state: yaAuth.state
    }), { mode: 0o600 }); } catch (e) { logAuth('не удалось сохранить сессию: ' + e.message); }
  }

  function authLoad() {
    try {
      const j = JSON.parse(fs.readFileSync(YA_AUTH_FILE, 'utf8'));
      yaAuth = {
        device_code: j.device_code, user_code: j.user_code,
        verification_url: j.verification_url || 'https://ya.ru/device',
        ts: Number(j.ts), expires_in: Number(j.expires_in) || 300,
        delay: Math.max(4000, Number(j.delay) || 5000), state: j.state === 'denied' ? 'denied' : 'pending'
      };
      if (Date.now() - yaAuth.ts > yaAuth.expires_in * 1000) {
        logAuth('найдена истёкшая сессия, сброшена');
        yaAuth = null; authSave();
      } else {
        logAuth('сессия восстановлена (код ' + yaAuth.user_code + ', осталось ~' + Math.round((yaAuth.ts + yaAuth.expires_in * 1000 - Date.now()) / 1000) + ' с)');
      }
    } catch (e) { yaAuth = null; }
    if (yaAuth && yaAuth.state === 'pending') scheduleYaTick(1000);
  }

  function authSnap() {
    if (!yaAuth) return { state: yandexToken() ? 'ready' : 'none' };
    if (yaAuth.state === 'denied') return { state: 'denied' };
    const left = Math.max(0, Math.round((yaAuth.ts + yaAuth.expires_in * 1000 - Date.now()) / 1000));
    if (left <= 0 || yaAuth.state === 'expired') return { state: 'expired' };
    return { state: 'pending', user_code: yaAuth.user_code, url: yaAuth.verification_url, left, interval: Math.round((yaAuth.delay || 5000) / 1000) };
  }

  function scheduleYaTick(ms) {
    if (yaTimer || !yaAuth) return;
    yaTimer = setTimeout(async () => {
      yaTimer = null;
      if (!yaAuth) return;
      if (yaAuth.state !== 'pending') return;
      const next = await authPollTick();
      if (yaAuth && yaAuth.state === 'pending' && next > 0) scheduleYaTick(next);
    }, Math.max(1000, ms));
  }

  async function authStart() {
    if (yaAuth && Date.now() < yaAuth.ts + yaAuth.expires_in * 1000 && yaAuth.state === 'pending') {
      return { ok: true, qr: authSnap() };
    }
    const r = await postForm(DEVICE_CODE_URL, {
      client_id: PASSPORT_CLIENT_ID,
      device_id: Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join(''),
      device_name: 'kanban-board'
    });
    if (r.status !== 200 || !r.json || !r.json.user_code) {
      return { error: 'Не удалось начать вход: ' + r.status + ' ' + String(r.text || '').slice(0, 120) };
    }
    clearYaTimer();
    yaAuth = {
      device_code: r.json.device_code, user_code: r.json.user_code,
      verification_url: r.json.verification_url || 'https://ya.ru/device',
      ts: Date.now(), expires_in: Number(r.json.expires_in) || 300,
      delay: Math.max(4000, (Number(r.json.interval) || 5) * 1000), state: 'pending'
    };
    authSave();
    logAuth('начат вход, код «' + yaAuth.user_code + '», срок ' + yaAuth.expires_in + ' с, интервал ' + yaAuth.delay + ' мс');
    scheduleYaTick(1000);
    return { ok: true, qr: authSnap() };
  }

  async function authPollTick() {
    if (!yaAuth) return 0;
    if (Date.now() - yaAuth.ts > yaAuth.expires_in * 1000) {
      logAuth('срок сессии истёк');
      yaAuth = null; authSave();
      return 0;
    }
    let r;
    try { r = await postForm(OAUTH_TOKEN_URL, {
      grant_type: 'device_code', code: yaAuth.device_code,
      client_id: PASSPORT_CLIENT_ID, client_secret: PASSPORT_CLIENT_SECRET
    }); }
    catch (e) { logAuth('ошибка сети при опросе: ' + e.message); return yaAuth.delay; }
    if (r.json && r.json.access_token) {
      const saved = setYandexToken(r.json.access_token);
      let devices = 0;
      let bad = null;
      if (saved) {
        try {
          const v = await yaRefreshDevices();
          if (v) devices = v.list.length;
          else bad = 'токен не принят облаком Quasar (401/404)';
        } catch (e) { bad = e.message; }
      }
      logAuth(saved ? ('успех: токен сохранён, облачных устройств ' + devices + (bad ? ', ' + bad : '')) : 'токен получен, но файл не записан');
      emit({ type: 'smart', kind: 'yandex', text: 'Токен Яндекса получен ✓' + (devices ? ', устройств Алисы: ' + devices : (bad ? ', но ' + bad : '')) });
      yaAuth = null; authSave();
      return 0;
    }
    const err = r.json && r.json.error;
    if (err === 'authorization_pending') return yaAuth.delay;
    if (err === 'slow_down') { yaAuth.delay = (yaAuth.delay || 5000) + 5000; logAuth('slow_down: интервал ' + yaAuth.delay + ' мс'); authSave(); return yaAuth.delay; }
    if (err === 'access_denied') { yaAuth.state = 'denied'; logAuth('вход отклонён пользователем'); authSave(); return 0; }
    if (err === 'expired_token') { logAuth('код истёк (expired_token)'); yaAuth = null; authSave(); return 0; }
    logAuth('неожиданный ответ token: HTTP ' + r.status + ' ' + String(r.text || '').slice(0, 150));
    return yaAuth.delay;
  }

  async function authPoll() {
    clearYaTimer();
    const next = await authPollTick();
    if (yaAuth && yaAuth.state === 'pending' && next > 0) scheduleYaTick(next);
    return authSnap();
  }

  function authStop() {
    clearYaTimer();
    yaAuth = null;
    authSave();
    logAuth('вход отменён');
    return { ok: true };
  }

  async function yaRefreshDevices() {
    if (!yandexToken()) return null;
    let r = null;
    for (let i = 0; i < 4; i++) {
      r = await yaSessionReq('GET', 'https://iot.quasar.yandex.ru/m/v3/user/devices', undefined, 9000);
      if (r.json && r.json.status === 'ok') break;
      await yaSessionCookies(true); // обновить сессию и повторить (эндпоинт бывает флейки)
    }
    if (!r || r.status >= 400 || !r.json || r.json.status !== 'ok') return null;
    const list = [];
    for (const house of (r.json.households || [])) list.push(...((house.all) || []));
    const byCloud = new Map();
    const byDId = new Map();
    for (const d of list) {
      byCloud.set(String(d.id), d);
      const did = (d.quasar_info || {}).device_id;
      if (did) byDId.set(String(did).toLowerCase(), d);
    }
    yaDevices = { ts: Date.now(), list, byCloud, byDId };
    return yaDevices;
  }

  async function yaDeviceOf(dev, force) {
    if (!yaDevices || force || Date.now() - yaDevices.ts > 60000) await yaRefreshDevices();
    if (!yaDevices) return null;
    const meta = dev.meta || {};
    const did = String(meta.deviceId || meta.device_id || '');
    if (did && yaDevices.byDId.has(did.toLowerCase())) return yaDevices.byDId.get(did.toLowerCase());
    const cid = String(meta.cloudId || '');
    if (cid && yaDevices.byCloud.has(cid)) return yaDevices.byCloud.get(cid);
    return yaDevices.list.find(d => String(d.name || '').trim().toLowerCase() === String(dev.name || '').trim().toLowerCase()) || null;
  }

  function yaStateOf(cd) {
    const st = {};
    if (!cd) return st;
    for (const cap of (cd.capabilities || [])) {
      const s = cap.state || {};
      const inst = s.instance;
      const v = s.value;
      if (cap.type === 'devices.capabilities.on_off' && inst === 'on') st.on = !!v;
      else if (cap.type === 'devices.capabilities.range' && inst === 'volume') st.volume = Number(v);
      else if (cap.type === 'devices.capabilities.range' && inst === 'brightness') st.brightness = Number(v);
      else if (cap.type === 'devices.capabilities.range' && inst === 'temperature') st.temperature = Number(v);
      else if (cap.type === 'devices.capabilities.toggle' && inst === 'mute') st.mute = !!v;
      else if (cap.type === 'devices.capabilities.toggle' && inst === 'pause') st.pause = !!v;
      else if (cap.type === 'devices.capabilities.range' && inst === 'channel') st.channel = Number(v);
    }
    return st;
  }

  async function yaAction(cd, instance, value, relative) {
    const action = {
      type: IOT_TYPES[instance] || 'devices.capabilities.custom.button',
      state: { instance, value }
    };
    if (relative) action.state.relative = true;
    const url = 'https://iot.quasar.yandex.ru/m/user/' + (cd.item_type || 'device') + 's/' + cd.id + '/actions';
    const r = await yaReq('POST', url, { actions: [action] }, 6000);
    if (r.status >= 400) return { error: 'Яндекс: ' + r.status + ' ' + String(r.text || '').slice(0, 140) };
    try {
      const g = await yaReq('GET', 'https://iot.quasar.yandex.ru/m/user/' + (cd.item_type || 'device') + 's/' + cd.id, undefined, 6000);
      if (g.json) {
        const nd = g.json.device || g.json;
        if (nd && nd.capabilities && yaDevices) yaDevices.byCloud.set(String(cd.id), nd);
      }
    } catch (e) {}
    const st = yaStateOf(yaDevices && yaDevices.byCloud ? (yaDevices.byCloud.get(String(cd.id)) || cd) : cd);
    return { ok: true, state: st };
  }

  async function yaSpeak(dev, text, isTts) {
    const cd = await yaDeviceOf(dev, true);
    if (!cd) return { error: 'станция не найдена у Яндекса (укажите deviceId или имя устройства)', code: 404 };
    const textStr = String(text || '').trim();
    if (!textStr) return { error: 'пустой текст' };
    const cap = isTts
      ? { type: 'devices.capabilities.quasar', state: { instance: 'tts', value: { text: textStr } } }
      : { type: 'devices.capabilities.quasar.server_action', state: { instance: 'text_action', value: textStr } };
    const stamp = Date.now().toString(36);
    const payload = {
      name: 'assist ' + stamp,
      icon: 'home',
      triggers: [{ trigger: { type: 'scenario.trigger.voice', value: 'ассистент ' + stamp } }],
      steps: [{
        type: 'scenarios.steps.actions.v2',
        parameters: { items: [{ id: cd.id, type: 'step.action.item.device', value: { id: cd.id, item_type: cd.item_type || 'device', capabilities: [cap] } }] }
      }]
    };
    const create = await yaReq('POST', 'https://iot.quasar.yandex.ru/m/user/scenarios', payload, 8000);
    if (create.status >= 400 || !create.json || create.json.status !== 'ok') {
      return { error: 'Не удалось создать сценарий: ' + create.status + ' ' + String(create.text || '').slice(0, 140) };
    }
    const sid = create.json.id;
    try {
      const run = await yaReq('POST', 'https://iot.quasar.yandex.ru/m/user/scenarios/' + sid + '/actions', undefined, 9000);
      if (run.status >= 400) return { error: 'Не удалось запустить: ' + run.status };
      return { ok: true, text: isTts ? 'сказано' : 'команда отправлена' };
    } finally {
      try { await yaReq('DELETE', 'https://iot.quasar.yandex.ru/m/user/scenarios/' + sid, undefined, 5000); } catch (e) {}
    }
  }

  /* минимальный WebSocket-клиент (RFC 6455) для локального указания станции */
  function wsAcceptKey(key) {
    return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  }

  class GlagolSocket {
    constructor(host, port, timeout) { this.host = host; this.port = port; this.timeout = timeout || 6000; this.buf = Buffer.alloc(0); }
    open() {
      return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(this.host) || this.host.includes(':');
        const sopts = { host: this.host, port: this.port, rejectUnauthorized: false };
        if (!isIp) sopts.servername = this.host;
        const sock = (this.sock = tls.connect(sopts));
        sock.setTimeout(this.timeout);
        sock.on('secureConnect', () => {
          sock.write('GET / HTTP/1.1\r\n' +
            'Host: ' + this.host + ':' + this.port + '\r\n' +
            'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: ' + key + '\r\n' +
            'Sec-WebSocket-Protocol: srvx_0.2\r\n' +
            'Origin: http://' + this.host + '\r\n\r\n');
        });
        sock.on('data', d => {
          this.buf = Buffer.concat([this.buf, d]);
          if (!this.handshaked) {
            const i = this.buf.indexOf('\r\n\r\n');
            if (i < 0) return;
            const head = this.buf.slice(0, i).toString('latin1');
            if (!/^HTTP\/1\.1 101/i.test(head)) return reject(new Error('WS: ' + head.split('\r\n')[0]));
            this.buf = this.buf.slice(i + 4);
            this.handshaked = true;
            this.queue = [];
            resolve(this);
          }
          this.frames();
        });
        sock.on('error', reject);
        sock.on('timeout', () => reject(new Error('ws timeout')));
      });
    }
    frames() {
      let off = 0;
      while (true) {
        if (this.buf.length - off < 2) break;
        const b0 = this.buf[off], b1 = this.buf[off + 1];
        const op = b0 & 0x0f;
        let len = b1 & 0x7f, p = off + 2;
        if (len === 126) { if (this.buf.length - off < 4) break; len = this.buf.readUInt16BE(p); p += 2; }
        else if (len === 127) { if (this.buf.length - off < 10) break; len = Number(this.buf.readBigUInt64BE(p)); p += 8; }
        if (len < 0 || this.buf.length < p + len) break;
        const payload = this.buf.slice(p, p + len);
        off = p + len;
        if (op === 1) { try { this.queue.push(JSON.parse(payload.toString('utf8'))); } catch (e) {} }
        else if (op === 8) { try { this.sock.end(); } catch (e) {} return; }
        else if (op === 9) { try { this.sendRaw(10, payload); } catch (e) {} }
      }
      this.buf = this.buf.slice(off);
      if (this.queue.length) { const q = this.queue.splice(0); for (const m of q) { if (this.onmsg) { try { this.onmsg(m); } catch (e) {} } } }
    }
    sendRaw(op, payload) {
      const mask = crypto.randomBytes(4);
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
      let head;
      if (payload.length < 126) head = Buffer.from([0x80 | op, 0x80 | payload.length]);
      else if (payload.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 0x80 | 126; head.writeUInt16BE(payload.length, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(payload.length), 2); }
      this.sock.write(Buffer.concat([head, mask, masked]));
    }
    send(obj) { this.sendRaw(1, Buffer.from(JSON.stringify(obj))); }
    close() { try { this.sendRaw(8, Buffer.alloc(0)); } catch (e) {} try { this.sock.destroy(); } catch (e) {} }
  }

  async function glagolDeviceToken(dev) {
    const did = dev.meta && (dev.meta.deviceId || dev.meta.device_id);
    const platform = dev.meta && dev.meta.platform;
    if (!did || !platform) throw new Error('у устройства нет deviceId/platform');
    const mt = await yaMusicToken();
    if (!mt) throw new Error('не удалось получить music-токен');
    const u = new URL('https://quasar.yandex.net/glagol/token');
    u.searchParams.set('device_id', String(did));
    u.searchParams.set('platform', String(platform));
    const r = await request('GET', u.toString(), undefined, 6000, { Authorization: 'OAuth ' + mt });
    if (r.status !== 200 || !r.json || r.json.status !== 'ok') throw new Error('token: HTTP ' + r.status);
    return r.json.token;
  }

  async function glagolSend(dev, payloadCmd) {
    const meta = dev.meta || {};
    const host = meta.host;
    const port = Number(meta.port || 1961) || 1961;
    if (!host) throw new Error('у устройства не указан IP станции (meta.host)');
    const token = await glagolDeviceToken(dev);
    const ws = new GlagolSocket(host, port, 6000);
    await ws.open();
    const mid = uid('w_');
    const reply = new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 7000);
      ws.onmsg = (msg) => {
        if (msg && msg.requestId === mid) { clearTimeout(t); resolve(msg); }
      };
    });
    ws.send({ conversationToken: token, id: mid, payload: payloadCmd, sentTime: Date.now() });
    const out = await reply;
    ws.close();
    return out;
  }

  function glagolLocal(dev, payloadCmd) { return glagolSend(dev, payloadCmd); }

  /* заставить станцию произнести фразу (TTS через локальный протокол) */
  function glagolSay(dev, text) {
    return glagolSend(dev, {
      command: 'serverAction',
      serverActionEventPayload: {
        type: 'server_action',
        name: 'update_form',
        payload: {
          form_update: {
            name: 'personal_assistant.scenarios.quasar.iot.repeat_phrase',
            slots: [{ type: 'string', name: 'phrase_to_repeat', value: String(text) }]
          },
          resubmit: true
        }
      }
    });
  }

  async function glagolPoll(dev) {
    if (!yandexToken()) return null;
    try { const cd = await yaDeviceOf(dev); return cd ? yaStateOf(cd) : null; } catch (e) { return null; }
  }

  /* минимальный protobuf-кодировщик (field: string) — для externalCommandBypass */
  function glagolProtobuf(msg) {
    const b = [];
    const vi = (i) => { while (i >= 0x80) { b.push(0x80 | (i & 0x7f)); i >>>= 7; } b.push(i); };
    for (const key of Object.keys(msg || {})) {
      const v = String(msg[key]);
      b.push((Number(key) << 3) | 2);
      vi(Buffer.byteLength(v, 'utf8'));
      for (const byte of Buffer.from(v, 'utf8')) b.push(byte);
    }
    return Buffer.from(b);
  }
  function glagolExtCmd(name) {
    return { command: 'externalCommandBypass', data: glagolProtobuf({ 1: name }).toString('base64') };
  }

  async function glagolCmd(dev, action, value) {
    const a = String(action || '').toLowerCase();
    if (!yandexToken()) return yaNeeded();
    const meta = dev.meta || {};
    const text = String(value == null ? '' : value);
    const canLocal = !!(meta.host && (meta.deviceId || meta.device_id) && meta.platform);
    if (a === 'say' || a === 'tts') {
      if (!text.trim()) return { error: 'пустой текст' };
      if (canLocal) {
        try {
          const r = await glagolSay(dev, text);
          if (r && r.status === 'SUCCESS') return { ok: true, text: 'станция произнесла фразу' };
          if (r && r.status) return { error: 'станция ответила: ' + r.status };
        } catch (e) { /* падаем в облако */ }
      }
      return Object.assign({ ok: true }, await yaSpeak(dev, text, true));
    }
    if (a === 'command' || a === 'alice') {
      if (!text.trim()) return { error: 'пустой текст команды' };
      if (canLocal) {
        try {
          const r = await glagolLocal(dev, { command: 'sendText', text });
          if (r && r.status === 'SUCCESS') return { ok: true, text: 'отправлено на станцию' };
        } catch (e) { /* падаем в облако */ }
      }
      const r = await yaSpeak(dev, text, false);
      if (r.error) return r;
      return { ok: true };
    }
    if (canLocal && (a === 'on' || a === 'off' || a === 'toggle' || a === 'volume')) {
      try {
        let lr = null;
        if (a === 'on' || a === 'off' || a === 'toggle') {
          const cur = dev.state && typeof dev.state.on === 'boolean' ? dev.state.on : true;
          const next = a === 'on' ? true : a === 'off' ? false : !cur;
          lr = await glagolLocal(dev, { command: next ? 'play' : 'stop' });
          if (lr && lr.status === 'SUCCESS') return { ok: true, state: { on: next } };
        } else if (a === 'volume') {
          const v = String(value == null ? '' : value).trim();
          if (/^[+-]/.test(v)) {
            lr = await glagolLocal(dev, glagolExtCmd(v.startsWith('+') ? 'sound_louder' : 'sound_quiter'));
          } else {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return { error: 'нужно число для громкости' };
            lr = await glagolLocal(dev, { command: 'setVolume', volume: Math.max(0, Math.min(1, n / 100)) });
          }
          if (lr && lr.status === 'SUCCESS') return { ok: true };
          if (lr && lr.status) return { error: 'станция: ' + lr.status + (lr.errorCode ? ' ' + lr.errorCode : '') };
        }
      } catch (e) { /* падаем в облако */ }
    }
    const cd = await yaDeviceOf(dev, true);
    if (!cd) return { error: 'устройство не найдено у Яндекса (укажите deviceId в meta)', code: 404 };
    const base = { on: cd => cd && yaStateOf(cd).on === undefined ? true : !!(cd && yaStateOf(cd).on) };
    if (a === 'on' || a === 'off' || a === 'toggle') {
      const cur = dev.state && typeof dev.state.on === 'boolean' ? dev.state.on : base.on(cd);
      return yaAction(cd, 'on', a === 'on' ? true : a === 'off' ? false : !cur);
    }
    if (a === 'volume') {
      let val = Number(value), relative = false;
      if (typeof value === 'string' && /^[+-]/.test(value.trim())) { val = Number(value); relative = true; }
      if (!Number.isFinite(val) && !relative) return { error: 'нужно число для громкости' };
      return yaAction(cd, 'volume', val, relative);
    }
    if (a === 'brightness') {
      let val = Number(value), relative = false;
      if (typeof value === 'string' && /^[+-]/.test(value.trim())) { val = Number(value); relative = true; }
      if (!Number.isFinite(val)) return { error: 'нужно число для яркости' };
      return yaAction(cd, 'brightness', val, relative);
    }
    if (a === 'set' && value && typeof value === 'object') {
      let last = null;
      for (const [k, v] of Object.entries(value)) { last = await yaAction(cd, k, v); if (last.error) return last; }
      return last || { ok: true, state: yaStateOf(yaDevices.byCloud.get(String(cd.id)) || cd) };
    }
    if (IOT_TYPES[a]) return yaAction(cd, a, value === undefined ? true : value);
    return { error: 'неизвестное действие: ' + action, code: 400 };
  }

  /* ---------------- mDNS / SSDP: обнаружение станций и устройств ---------------- */

  function parseTxt(rd) {
    const out = {};
    let i = 0;
    while (i < rd.length) {
      const len = rd[i++];
      if (!len || i + len > rd.length) break;
      const s = rd.slice(i, i + len).toString('utf8');
      const eq = s.indexOf('=');
      if (eq > 0) out[s.slice(0, eq).toLowerCase()] = s.slice(eq + 1);
      i += len;
    }
    return out;
  }

  function dnsName(buf, off) {
    const labels = [];
    let next = null, p = off, guard = 0;
    while (p < buf.length && guard++ < 64) {
      const len = buf[p];
      if (len === 0) { p++; break; }
      if ((len & 0xc0) === 0xc0) {
        if (next === null) next = p + 2;
        p = ((len & 0x3f) << 8) | buf[p + 1];
        continue;
      }
      p++;
      if (p + len > buf.length) break;
      labels.push(buf.slice(p, p + len).toString('utf8'));
      p += len;
    }
    return { name: labels.join('.').toLowerCase(), next: next === null ? p : next };
  }

  function encodeQName(name) {
    const parts = [];
    for (const label of String(name).split('.')) {
      const b = Buffer.from(label);
      parts.push(Buffer.from([b.length]), b);
    }
    parts.push(Buffer.from([0]));
    return Buffer.concat(parts);
  }

  function isLanIp(ip) {
    const m = String(ip || '').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = +m[1], b = +m[2];
    if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return true;
    return false;
  }

  function mdnsDiscover(timeout) {
    return new Promise((resolve) => {
      const byService = new Map();
      const srcIps = new Map();
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const queries = [
        ['_services._dns-sd._udp.local', 12], ['_yandexio._tcp.local', 12], ['_yandex-station._tcp.local', 12],
        ['_yandexreceiver._tcp.local', 12], ['_yanex._tcp.local', 12], ['_googlecast._tcp.local', 12],
        ['_hap._tcp.local', 12], ['_tuya._tcp.local', 12], ['_mqtt._tcp.local', 12]
      ];
      const finish = () => {
        try { s.close(); } catch (e) {}
        const hosts = new Map();
        for (const [inst, svc] of byService) {
          if (!svc || !svc.port) continue;
          const m = inst.match(/\.(_[\w-]+\._tcp)\.local$/i);
          const stype = m ? m[1] : '';
          const ip = svc.ip || (srcIps.get(inst) || '').split(',')[0];
          if (!isLanIp(ip)) continue;
          let h = hosts.get(ip);
          if (!h) hosts.set(ip, h = { ip, hostname: svc.target || '', services: [] });
          h.services.push({ type: stype, port: svc.port, name: inst, txt: svc.txt || {} });
        }
        resolve(Array.from(hosts.values()));
      };
      const total = timeout || 5000;
      const timer = setTimeout(finish, total);
      const waves = [80, 1300, 2600, 3800];
      s.on('message', (m, ri) => {
        if (m.length < 12) return;
        let off = 12;
        const qd = m.readUInt16BE(4), an = m.readUInt16BE(6), ar = m.readUInt16BE(8);
        for (let i = 0; i < qd && off < m.length; i++) { off = dnsName(m, off).next; off += 4; }
        for (let i = 0; i < an + ar && off + 10 < m.length; i++) {
          const nm = dnsName(m, off); off = nm.next;
          const type = m.readUInt16BE(off), rdlen = m.readUInt16BE(off + 8);
          off += 10;
          const rdOff = off; off += rdlen;
          if (type === 1 && rdlen === 4) {
            const ip = Array.from(m.slice(rdOff, rdOff + 4)).join('.');
            const svc = byService.get(nm.name);
            if (svc) svc.ip = ip;
            srcIps.set(nm.name, ((srcIps.get(nm.name) || '') + ',' + ri.address + ',' + ip).replace(/^,/, ''));
          } else if (type === 33 && rdlen >= 6) {
            const port = m.readUInt16BE(rdOff + 4);
            const target = dnsName(m, rdOff + 6).name;
            byService.set(nm.name, Object.assign({}, byService.get(nm.name), { port, target }));
            srcIps.set(nm.name, ((srcIps.get(nm.name) || '') + ',' + ri.address).replace(/^,/, ''));
          } else if (type === 16) {
            byService.set(nm.name, Object.assign({}, byService.get(nm.name), { txt: parseTxt(m.slice(rdOff, rdOff + rdlen)) }));
            srcIps.set(nm.name, ((srcIps.get(nm.name) || '') + ',' + ri.address).replace(/^,/, ''));
          }
        }
      });
      const sendQueries = () => {
        for (const [n, t] of queries) {
          const q = Buffer.concat([
            Buffer.from([0x12, 0x34, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
            encodeQName(n), Buffer.from([0x00, t, 0x00, 0x01])
          ]);
          try { s.send(q, 5353, '224.0.0.251', () => {}); } catch (e) {}
        }
      };
      s.on('error', () => clearTimeout(timer));
      s.bind(5353, () => {
        try {
          s.addMembership('224.0.0.251');
          s.setMulticastTTL(2);
          s.setMulticastLoopback(true);
        } catch (e) {}
        sendQueries();
        for (const w of waves) setTimeout(sendQueries, w);
      });
    });
  }

  function ssdpDiscover(timeout) {
    return new Promise((resolve) => {
      const hosts = new Map();
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const msg = Buffer.from('M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' + 'MAN: "ssdp:discover"\r\n' +
        'MX: 2\r\n' + 'ST: ssdp:all\r\n' + 'USER-AGENT: KabanSmart/1.0 smart.js\r\n\r\n');
      const finish = () => {
        try { s.close(); } catch (e) {}
        resolve(Array.from(hosts.values()));
      };
      const timer = setTimeout(finish, timeout || 2500);
      s.on('message', (m, ri) => {
        const txt = m.toString('latin1');
        if (!/^HTTP\/1\.[01]\s+200/i.test(txt)) return;
        let h = hosts.get(ri.address);
        if (!h) hosts.set(ri.address, h = { ip: ri.address, services: [], location: '' });
        const loc = (txt.match(/^LOCATION:\s*([^\s]+)/mi) || [])[1] || '';
        if (loc) h.location = loc;
        const st = (txt.match(/^ST:\s*(.+)$/mi) || [])[1] || '';
        const usn = (txt.match(/^USN:\s*(.+)$/mi) || [])[1] || '';
        h.services.push({ type: 'ssdp:' + st, usn });
        s.send(msg, 1900, ri.address, () => {});
      });
      s.on('error', () => clearTimeout(timer));
      s.bind(0, () => {
        try { s.addMembership('239.255.255.250'); s.setMulticastTTL(2); s.setMulticastLoopback(true); } catch (e) {}
        s.send(msg, 1900, '239.255.255.250', () => {});
      });
    });
  }

  async function lanDiscover() {
    const [m, ss] = await Promise.all([mdnsDiscover(4000), ssdpDiscover(2200)]);
    const out = new Map();
    for (const h of m) out.set(h.ip, h);
    for (const h of ss) {
      const x = out.get(h.ip);
      if (x) x.ssdp = h.services;
      else out.set(h.ip, Object.assign({ ip: h.ip, hostname: '', services: [], ssdp: h.services, txt: {} }, { services: [] }));
    }
    return Array.from(out.values());
  }

  function platformName(p) {
    const v = YANDEX_PLATFORMS[p];
    return (v && v[1]) || '';
  }

  function stationKindOf(host) {
    const p = host.platform || '';
    if (!p) return '';
    return (p === 'yandex_tv' || YANDEX_TV_KEYS.has(p) || /^yandex_tv/.test(p)) ? 'media' : 'station';
  }

  const ADAPTERS = {
    manual: { poll: null, cmd: manualCmd },
    webhook: { poll: null, cmd: httpCmd },
    http: { poll: httpPoll, cmd: httpCmd },
    glagol: { poll: glagolPoll, cmd: glagolCmd },
    tuya: { stub: 'Адаптер Tuya LAN появится на этапе 3 (нужен локальный ключ устройства).' },
    voice: { stub: 'Голосовые команды станции работают через glagol: smart say/command.' },
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
    const mports = host.mports || [];
    const quasar = host.deviceId || host.platform || mports.includes(1961) || ports.includes(1961);
    const alice1337 = ports.includes(1337);
    if (quasar || alice1337) {
      let meta = {};
      if (quasar) {
        meta = { deviceId: host.deviceId || '', platform: host.platform || '', host: host.ip };
        if (mports[0] || ports.includes(1961)) meta.port = mports[0] || 1961;
      }
      out.push({
        kind: stationKindOf(host) || 'station',
        adapter: 'glagol',
        name: quasar ? (platformName(host.platform) || 'Яндекс Станция') : 'Алиса (станция)',
        meta
      });
    }
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
        if (!found.has(ip)) found.set(ip, { ip, ports: [], mports: [], marks: [], title: '', server: '', alive: false, ts: Date.now() });
        return found.get(ip);
      };
      emit({ type: 'scan', phase: 'progress', stage: 'discovery', done: 0, total: 1 });
      const discovered = await lanDiscover();
      for (const h of discovered) {
        const rec = get(h.ip);
        rec.alive = true;
        rec.mports = h.services.filter(s => s.port).map(s => s.port);
        const yio = h.services.find(s => /yandexio|yandex-station|yanex|yandexreceiver/i.test(s.type)) || h.services[0];
        const txt = yio && yio.txt ? yio.txt : {};
        if (txt.deviceId) rec.deviceId = txt.deviceId;
        if (txt.platform) rec.platform = txt.platform;
        if (h.hostname && !rec.mdns) rec.mdns = h.hostname;
        if (!rec.title) rec.title = platformName(txt.platform) || h.hostname || rec.mdns || '';
        if (h.services.some(s => s.type === '_googlecast._tcp.local')) rec.marks.push('chromecast');
      }
      emit({ type: 'scan', phase: 'progress', stage: 'discovery', done: 1, total: 1 });
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
        .filter(h => h.alive || h.ports.length || h.mports.length)
        .map(h => Object.assign({}, h, { mac: macs[h.ip] || '' }));
      hosts.sort((a, b) => (b.ports.length + b.mports.length) - (a.ports.length + a.mports.length) || Number(b.alive) - Number(a.alive) || a.ip.localeCompare(b.ip));
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
          ip: h.ip, ports: h.ports, mports: h.mports, mac: h.mac, title: h.title,
          deviceId: h.deviceId || '', platform: h.platform || '', alive: h.alive,
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

  function metaFromBody(body, prevMeta) {
    const m = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const out = Object.assign({}, prevMeta || {});
    if (m.cmdUrl !== undefined) out.cmdUrl = String(m.cmdUrl || '').slice(0, 300);
    if (m.pollUrl !== undefined) out.pollUrl = String(m.pollUrl || '').slice(0, 300);
    if (m.deviceId !== undefined) out.deviceId = String(m.deviceId || '').slice(0, 80);
    if (m.platform !== undefined) out.platform = String(m.platform || '').slice(0, 40);
    if (m.cloudId !== undefined) out.cloudId = String(m.cloudId || '').slice(0, 80);
    if (m.host !== undefined) out.host = String(m.host || '').slice(0, 40);
    if (m.port !== undefined) out.port = String(m.port || '').slice(0, 12);
    return out;
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
      const prevMeta = dev.meta || {};
      const m = metaFromBody(body, prevMeta);
      if (m) dev.meta = m;
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
      meta: metaFromBody(body, {}) || {},
      state: {}, stateAt: 0, online: true, created: Date.now()
    };
    const dup = store.devices.find(x => x.adapter === adapter && nd.ip && x.ip === nd.ip && (x.meta.deviceId || '') === (nd.meta.deviceId || ''));
    if (dup && dup.id !== nd.id) {
      dup.name = name; dup.kind = kind; dup.adapter = adapter;
      dup.ip = nd.ip; dup.port = nd.port; dup.mac = nd.mac; dup.notes = nd.notes;
      const prevMeta = dup.meta || {};
      const m = metaFromBody(body, prevMeta);
      if (m) dup.meta = m;
      save();
      emit({ type: 'smart', kind: 'change', deviceId: dup.id, name: dup.name, text: 'Устройство обновлено: ' + dup.name });
      return { device: dup, merged: true };
    }
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
          ip: h.ip, ports: h.ports, mports: h.mports || [], mac: h.mac, title: h.title, marks: h.marks,
          deviceId: h.deviceId || '', platform: h.platform || '', alive: h.alive,
          suggest: suggestionsOf(h), ts: h.ts
        })),
        scanAt: store.scanAt, scanning,
        events: events.slice(0, 50),
        kinds: KINDS, adapters: ADAPTER_LIST,
        key: !!smartKey(), yandex: !!yandexToken(), auth: authSnap()
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

    if (p === '/api/smart/config') {
      if (body.yandexToken === undefined) return json(res, 200, { ok: true, yandex: !!yandexToken() });
      const saved = setYandexToken(body.yandexToken);
      if (!saved) return json(res, 500, { ok: false, error: 'не удалось записать токен' });
      return json(res, 200, { ok: true, yandex: !!yandexToken() });
    }

    if (p === '/api/smart/auth') {
      const action = String(body.action || '').toLowerCase();
      if (action === 'start') {
        const r = await authStart();
        if (r.error) return json(res, 400, { error: r.error });
        return json(res, 200, { ok: true, auth: r.qr });
      }
      if (action === 'stop') {
        authStop();
        return json(res, 200, { ok: true, auth: authSnap() });
      }
      if (action === 'status' || action === 'poll') {
        const r = await authPoll();
        return json(res, 200, { ok: true, auth: r });
      }
      return json(res, 400, { error: 'нужен action: start|stop|status' });
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
      return json(res, 200, { ok: true, merged: !!r.merged, device: r.device });
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
  authLoad();

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
