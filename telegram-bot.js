'use strict';

/* telegram-bot.js — мост Telegram Bot API к ассистенту.
   Работает без открытых портов: исходящий long-poll к Telegram.
   Настройки через окружение:
     TELEGRAM_API_BASE  базовый адрес API (для зеркал/прокси), по умолчанию https://api.telegram.org
     HTTPS_PROXY|ALL_PROXY  HTTP/HTTPS-прокси для доступа (tunnel CONNECT); то же в нижнем регистре
   start({ token, allowed, cli, dbPath, log, ask })
     ask(text) -> Promise<string> — обработка обычного сообщения ассистентом. */

const http = require('http');
const https = require('https');
const tls = require('tls');
const { execFile } = require('child_process');
const path = require('path');

function apiBase() {
  return process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
}
function apiHost() {
  return apiBase().replace(/^https?:\/\//, '').split('/')[0];
}
function proxyFromEnv() {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy || '';
  if (!p) return null;
  const u = new URL(p.startsWith('http') ? p : 'http://' + p);
  return { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 8080) };
}

function readResp(res) {
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', d => { data += d; if (data.length > 2e6) { reject(new Error('response too large')); res.destroy(); } });
    res.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad telegram response')); }
    });
  });
}

function directRequest(baseHost, reqPath, payload) {
  return new Promise((resolve, reject) => {
    const proto = apiBase().startsWith('http://') ? http : https;
    const req = proto.request({ hostname: baseHost, port: proto === http ? 80 : 443, method: 'POST', path: reqPath,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 55000 }, (res) => {
      readResp(res).then(resolve, reject);
    });
    req.on('timeout', () => { try { req.destroy(); } catch (e) {} reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function tunneledRequest(proxy, baseHost, reqPath, payload) {
  return new Promise((resolve, reject) => {
    const connect = http.request({ host: proxy.host, port: proxy.port, method: 'CONNECT', path: baseHost + ':443', headers: { Host: baseHost + ':443' } });
    connect.setTimeout(12000, () => { try { connect.destroy(); } catch (e) {} reject(new Error('proxy timeout')); });
    connect.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { try { socket.destroy(); } catch (e) {} return reject(new Error('proxy CONNECT ' + res.statusCode)); }
      const tlsSock = tls.connect({ socket, servername: baseHost });
      tlsSock.on('secureConnect', () => {
        const req = http.request({ host: baseHost, method: 'POST', path: reqPath,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
          agent: false, createConnection: () => tlsSock }, (resp) => {
          readResp(resp).then(resolve, reject);
        });
        req.on('timeout', () => { try { req.destroy(); } catch (e) {} reject(new Error('proxy tunnel timeout')); });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
      tlsSock.on('error', reject);
    });
    connect.on('error', reject);
    connect.end();
  });
}

function tgCall(token, method, params) {
  const base = apiBase();
  const baseHost = apiHost();
  const reqPath = '/bot' + token + '/' + method;
  const payload = JSON.stringify(params || {});
  const proxy = proxyFromEnv();
  return proxy ? tunneledRequest(proxy, baseHost, reqPath, payload) : directRequest(baseHost, reqPath, payload);
}

function runCli(opts, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [opts.cli, '--db', opts.dbPath, ...(args || [])],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => resolve(String(stdout || '').trim() || String(stderr || '').trim() || (err ? '❌ ' + err.message : '')));
  });
}

function sendMsg(opts, chatId, text) {
  return tgCall(opts.token, 'sendMessage', { chat_id: chatId, text: String(text || '').slice(0, 4000) });
}

function sendHelp(opts, chatId) {
  return sendMsg(opts, chatId, 'Привет! Я ассистент Big Pickle.\nПиши обычным текстом — отвечу, занесу найденное в карточки доски, запомню факты.\nКоманды:\n/status — состояние доски\n/board — содержимое колонок\n/add текст — карточка в первую колонку\n/memo текст — запомнить факт');
}

async function handleMessage(u, opts) {
  const m = u.message;
  if (!m || typeof m.text !== 'string') return;
  const chatId = String(m.chat.id);
  const who = String((m.from && m.from.id) || '');
  const allowed = Array.isArray(opts.allowed) ? opts.allowed : [];
  if (allowed.length && !allowed.includes(chatId) && !allowed.includes(who)) return;
  const raw = m.text.trim();
  if (!raw) return;
  if (raw === '/start' || raw === '/help') return sendHelp(opts, chatId);
  if (raw === '/status') return sendMsg(opts, chatId, await runCli(opts, ['status']));
  if (raw === '/board') return sendMsg(opts, chatId, await runCli(opts, ['list']));
  if (raw.startsWith('/add ')) return sendMsg(opts, chatId, await runCli(opts, ['add', raw.slice(5).trim()]));
  if (raw.startsWith('/memo ')) return sendMsg(opts, chatId, await runCli(opts, ['remember', raw.slice(6).trim()]));
  try {
    const reply = await opts.ask(raw);
    return sendMsg(opts, chatId, reply);
  } catch (e) {
    opts.log('ask error: ' + (e && e.message));
    return sendMsg(opts, chatId, '⚠️ Ошибка: ' + (e && e.message));
  }
}

async function loop(opts) {
  let offset = 0;
  let fails = 0;
  while (true) {
    try {
      const res = await tgCall(opts.token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'], limit: 25 });
      if (res.ok === false) {
        if (res.error_code === 401) { opts.log('неверный токен (401) — бот остановлен'); return; }
        if (res.error_code === 409) { opts.log('конфликт long-poll: запущено несколько экземпляров бота'); return; }
        fails++;
        if (fails > 10) { opts.log('слишком много ошибок подряд — остановлено (' + JSON.stringify(res).slice(0, 160) + ')'); return; }
        continue;
      }
      if (fails > 3) opts.log('связь с Telegram восстановлена');
      fails = 0;
      for (const u of (res.result || [])) {
        offset = Math.max(offset, u.update_id + 1);
        try { await handleMessage(u, opts); } catch (e) { opts.log('handler error: ' + (e && e.message)); }
      }
    } catch (e) {
      fails++;
      if (fails === 1) opts.log('Telegram недоступен: ' + (e && e.message) + ' (для RU-сетей укажите HTTPS_PROXY или TELEGRAM_API_BASE)');
      else if (fails % 5 === 0) opts.log('Telegram всё ещё недоступен (' + fails + ' попыток)');
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

function start(opts) {
  const merged = Object.assign({ token: '', allowed: [], cli: path.join(__dirname, 'assist-cli.js'), dbPath: '', log: () => {}, ask: null }, opts);
  if (!merged.token || typeof merged.ask !== 'function') return;
  loop(merged);
}

module.exports = { start, apiBase, proxyFromEnv };