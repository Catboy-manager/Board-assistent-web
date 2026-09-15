'use strict';

/* assist.js — сервисы «системного ассистента» (общий модуль для web и desktop):
   - /api/assist/tts            озвучка текста (piper → espeak-ng)
   - /api/assist/memory         долговременная память (факты между диалогами)
   - /api/assist/reminders      напоминания по времени
   - /api/assist/events         SSE: доставка напоминаний в интерфейс
   - /api/assist/sys/volume     громкость (pactl/amixer, +%/−%)
   - /api/assist/sys/clipboard  чтение буфера обмена
   - /api/assist/sys/screenshot скриншот (+ OCR, tesseract)
   - /api/assist/ollama         доступность локальной модели (Ollama)
   Плюс экспорты: getMemoryContext (врезка памяти в промпт), remember, addReminder.
   Все функции деградируют мягко, если инструмент не установлен. */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

module.exports = function createAssist({ dataDir }) {
  const MEMORY_FILE = path.join(dataDir, 'memory.json');
  const REMINDERS_FILE = path.join(dataDir, 'reminders.json');

  let memory = [];
  let reminders = [];
  loadFiles();

  function loadFiles() {
    try { memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) { memory = []; }
    try { reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); } catch (e) { reminders = []; }
    reminders = (Array.isArray(reminders) ? reminders : []).filter(r => r && r.at && new Date(r.at).getTime() > Date.now() - 3600e3);
    saveMemoryFS(); saveRemindersFS();
  }
  function saveMemoryFS() {
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2)); } catch (e) {}
  }
  function saveRemindersFS() {
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2)); } catch (e) {}
  }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ================= TTS ================= */

  function engines() {
    const model = ttsModel();
    let piperOk = false;
    if (model) {
      if (ttsWrapper() && pyBin()) piperOk = true;
      else {
        const pb = piperBin();
        if (pb) {
          const isPath = pb.includes('/') || pb.includes('\\');
          piperOk = isPath ? fs.existsSync(pb) : Boolean(which(pb));
        }
      }
    }
    return {
      piper: piperOk,
      espeak: Boolean(which('espeak-ng') || which('espeak'))
    };
  }

  function which(bin) {
    const paths = (process.env.PATH || '').split(path.delimiter);
    for (const dir of paths) {
      for (const n of [bin, bin + (process.platform === 'win32' ? '.exe' : '')]) {
        try { const f = path.join(dir, n); if (fs.statSync(f).isFile()) return f; } catch (e) {}
      }
    }
    return '';
  }

  /* системный сервис может не знать WAYLAND_DISPLAY/DISPLAY — находим их у процессов текущего пользователя */
  let DISP_ENV = null;
  function displayEnv() {
    if (DISP_ENV) return DISP_ENV;
    DISP_ENV = {};
    if (process.env.WAYLAND_DISPLAY || process.env.DISPLAY) {
      for (const k of ['XDG_RUNTIME_DIR', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS']) if (process.env[k]) DISP_ENV[k] = process.env[k];
      return DISP_ENV;
    }
    const want = ['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS'];
    try {
      const dirs = fs.readdirSync('/proc');
      let found = 0;
      for (const pid of dirs) {
        if (!/^\d+$/.test(pid)) continue;
        let e = '';
        try { e = fs.readFileSync('/proc/' + pid + '/environ'); } catch (er) { continue; }
        e = e.toString('latin1');
        for (const line of e.split('\0')) {
          const m = line.match(/^(WAYLAND_DISPLAY|DISPLAY|XDG_RUNTIME_DIR|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS)=(.+)$/);
          if (m && DISP_ENV[m[1]] === undefined) { DISP_ENV[m[1]] = m[2]; found++; }
        }
        if (found === want.length) break;
      }
    } catch (e) {}
    return DISP_ENV;
  }

  function piperBin() {
    if (process.env.KANBAN_PIPER && fs.existsSync(process.env.KANBAN_PIPER)) return process.env.KANBAN_PIPER;
    const local = path.join(os.homedir(), '.local', 'bin', 'piper');
    if (fs.existsSync(local)) return local;
    return process.platform === 'win32' ? 'piper.exe' : 'piper';
  }
  function ttsModel() {
    if (process.env.KANBAN_TTS_MODEL && fs.existsSync(process.env.KANBAN_TTS_MODEL)) return process.env.KANBAN_TTS_MODEL;
    const m = path.join(dataDir, 'tts', 'ru_RU-irina-medium.onnx');
    return fs.existsSync(m) ? m : '';
  }
  function ttsWrapper() {
    const w = path.join(dataDir, 'tts', 'piper-ru.py');
    return fs.existsSync(w) ? w : '';
  }
  function pyBin() {
    if (process.platform === 'win32') return which('python') || which('py') || 'python';
    return which('python3') || which('python') || 'python3';
  }

  function runTTS(text, outFile) {
    return new Promise((resolve, reject) => {
      const safe = String(text || '').replace(/[\r\n"`]/g, ' ').slice(0, 400);
      if (!safe.trim()) return reject(new Error('empty text'));
      const model = ttsModel();
      let cmd = '';
      let args = [];
      const wrap = ttsWrapper();
      if (model && wrap && pyBin()) { cmd = pyBin(); args = [wrap, model, outFile]; }
      else if (model) {
        const pb = piperBin();
        const isPath = pb && (pb.includes('/') || pb.includes('\\'));
        if (pb && (isPath ? fs.existsSync(pb) : Boolean(which(pb)))) {
          cmd = pb;
          args = ['--model', model, '--output_file', outFile];
        }
      }
      if (cmd) {
        const child = spawn(cmd, args);
        let err = '';
        child.stderr.on('data', d => { err += String(d); });
        child.on('error', (e) => reject(new Error(cmd + ': ' + e.message)));
        child.on('close', (code) => {
          if (code === 0 && fs.existsSync(outFile)) resolve();
          else reject(new Error(cmd + ': exit ' + code + (err ? ' ' + err.slice(0, 200) : '')));
        });
        child.stdin.on('error', () => {});
        child.stdin.write(safe + '\n');
        child.stdin.end();
      } else {
        const bin = which('espeak-ng') || which('espeak');
        if (!bin) return reject(new Error('Нет TTS: установите espeak-ng или piper'));
        execFile(bin, ['-v', process.platform === 'win32' ? 'ru' : 'ru+m3', '-s', '165', '--stdout', safe], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
          if (err) reject(new Error('espeak: ' + err.message));
          else { fs.writeFileSync(outFile, stdout); resolve(); }
        });
      }
    });
  }

  /* ================= Память ================= */

  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function memScore(q, t) {
    const a = new Set(norm(t).split(/\s+/).filter(w => w.length > 2));
    const b = new Set(norm(q).split(/\s+/).filter(w => w.length > 2));
    let n = 0; for (const w of b) if (a.has(w)) n++;
    return n;
  }
  function getMemoryContext(query, n = 6) {
    if (!memory.length) return '';
    const ranked = memory.slice().sort((x, y) => memScore(query, y.text) - memScore(query, x.text));
    return ranked.slice(0, n).map(m => '• ' + m.text).join('\n');
  }
  function remember(text, by) {
    const t = String(text || '').trim();
    if (!t) return null;
    memory.unshift({ id: uid('mem_'), text: t, by: by || 'user', ts: new Date().toISOString() });
    if (memory.length > 300) memory.length = 300;
    saveMemoryFS();
    return memory[0];
  }
  function forgetMatch(text) {
    const q = norm(text);
    const before = memory.length;
    memory = memory.filter(m => memScore(m.text, q) === 0);
    saveMemoryFS();
    return before - memory.length;
  }

  /* ================= Напоминания ================= */

  function addReminder(text, atIso) {
    if (!text || !atIso) return null;
    const r = { id: uid('rem_'), text: String(text), at: atIso, sent: false, ts: new Date().toISOString() };
    reminders.push(r);
    reminders.sort((a, b) => new Date(a.at) - new Date(b.at));
    saveRemindersFS();
    return r;
  }
  function removeReminder(id) {
    const before = reminders.length;
    reminders = reminders.filter(r => r.id !== id);
    saveRemindersFS();
    return before !== reminders.length;
  }
  function dueReminders(now) {
    const due = reminders.filter(r => !r.sent && new Date(r.at).getTime() <= now);
    if (due.length) {
      for (const r of due) r.sent = true;
      saveRemindersFS();
    }
    return due;
  }

  /* ================= Системные действия ================= */

  function ex(cmd, args, buf) {
    return new Promise((resolve) => {
      execFile(cmd, args, { maxBuffer: buf || 10 * 1024 * 1024, env: Object.assign({}, process.env, displayEnv(), { LC_ALL: 'C' }) }, (err, stdout, stderr) => {
        resolve({ err, out: String(stdout || ''), errOut: String(stderr || '') });
      });
    });
  }

  async function volume(delta) {
    if (process.platform === 'win32') {
      const keys = { '+': '175', '-': '174', mute: '173' }[delta] || '175';
      await ex('powershell', ['-Command', 'try { (New-Object -ComObject WScript.Shell).SendKeys([char]' + keys + ') } catch {}']);
      return { ok: true };
    }
    const sink = '@DEFAULT_SINK@';
    if (delta === 'mute') {
      await ex('pactl', ['set-sink-mute', sink, 'toggle']);
      return { ok: true };
    }
    let res = await ex('pactl', ['set-sink-volume', sink, (delta > 0 ? '+' : '') + delta + '%']);
    if (res.err || /no such/.test(res.errOut)) {
      await ex('amixer', ['set', 'Master', (delta > 0 ? '+' : '') + delta + '%', 'unmute']);
    }
    const get = await ex('pactl', ['get-sink-volume', sink]);
    const m = String(get.out).match(/(\d+)%/);
    return { ok: true, level: m ? m[1] : null };
  }

  async function clipboard() {
    if (process.platform === 'win32') {
      const r = await ex('powershell', ['-Command', 'Get-Clipboard']);
      return { ok: !r.err, text: r.out.trim() };
    }
    for (const cmd of ['wl-paste --no-newline --clipboard', 'wl-paste --no-newline', 'xclip -selection clipboard -o', 'xsel --clipboard --output']) {
      const parts = cmd.split(' ');
      const r = await ex(parts[0], parts.slice(1));
      if (!r.err && r.out.trim()) return { ok: true, text: r.out.trim() };
    }
    return { ok: false, error: 'Нет утилиты чтения буфера (нужен wl-paste/xclip/xsel)' };
  }

  async function screenshot(withOcr) {
    const tmp = path.join(os.tmpdir(), 'kban-shot-' + uid('s') + '.png');
    let ok = false;
    const fsAt = (f) => { try { return fs.statSync(f).size >= 1000; } catch (e) { return false; } };
    if (process.platform === 'win32') {
      const ps = 'Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;' +
        ' $b=[Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object Drawing.Bitmap $b.Width,$b.Height;' +
        ' $g=[Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size);' +
        ' $bmp.Save("' + tmp.replace(/\\/g, '\\\\') + '",[Drawing.Imaging.ImageFormat]::Png)';
      await ex('powershell', ['-NoProfile', '-Command', ps]);
      ok = fsAt(tmp);
    } else {
      let r = await ex('import', ['-window', 'root', tmp]);
      ok = fsAt(tmp);
      if (!ok && displayEnv().DBUS_SESSION_BUS_ADDRESS) {
        r = await ex('dbus-send', ['--session', '--type=method_call', '--dest=org.gnome.Shell', '/org/gnome/Shell/Screenshot', 'org.gnome.Shell.Screenshot.Screenshot', 'boolean:false', 'boolean:false', 'string:' + tmp], 20 * 1024 * 1024);
        ok = fsAt(tmp);
      }
      if (!ok) {
        r = await ex('gnome-screenshot', ['-f', tmp]);
        ok = fsAt(tmp);
      }
      if (!ok && !r.errOut && r.err) ok = fsAt(tmp);
    }
    if (!ok) return { ok: false, error: 'Не удалось сделать скриншот (X11/Wayland)' };
    if (withOcr) {
      const t = which('tesseract');
      if (!t) return { file: tmp, ok: false, ocrError: 'Нет tesseract' };
      const o = await ex(t, [tmp, 'stdout', '-l', 'rus'], 50 * 1024 * 1024);
      try { fs.unlinkSync(tmp); } catch (e) {}
      return { ok: true, ocr: o.out.trim() || o.errOut.trim() };
    }
    return { ok: true, file: tmp };
  }

  async function ollamaInfo() {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return { available: false };
      const d = await r.json();
      return { available: true, models: (d.models || []).map(m => (m.name || '').replace(/:latest$/, '')) };
    } catch (e) { return { available: false }; }
  }

  /* ================= SSE (напоминания в реальном времени) ================= */

  function eventsSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(':ok\n\n');
    const timer = setInterval(() => {
      try {
        const due = dueReminders(Date.now());
        for (const r of due) {
          res.write('data: ' + JSON.stringify({ type: 'reminder', id: r.id, text: r.text, at: r.at }) + '\n\n');
        }
        res.write(':k\n\n');
      } catch (e) { /* res закрыт */ }
    }, 2000);
    req.on('close', () => clearInterval(timer));
  }

  /* ================= обработчик запросов ================= */

  async function handle(p, url, req, res, ctx) {
    const json = ctx.json;
    if (p === '/api/assist/tts' && req.method === 'GET') {
      const text = url.searchParams.get('text');
      if (!text) return json(res, 400, { error: 'text required' });
      const out = path.join(os.tmpdir(), 'kban-tts-' + uid('t') + '.wav');
      try {
        await runTTS(text, out);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(out));
        try { fs.unlinkSync(out); } catch (e) {}
      } catch (e) {
        return json(res, 500, { error: e.message, engines: engines() });
      }
      return true;
    }
    if (p === '/api/assist/engines' && req.method === 'GET') {
      return json(res, 200, { engines: engines(), ollama: await ollamaInfo() });
    }

    if (p === '/api/assist/memory') {
      if (req.method === 'GET') return json(res, 200, { items: memory, count: memory.length });
      const body = await ctx.readBody(req).then(b => { try { return JSON.parse(b.toString() || '{}'); } catch (e) { return {}; } });
      if (req.method === 'POST') {
        const m = remember(body.text, body.by);
        return json(res, 200, { ok: !!m, item: m, count: memory.length });
      }
      if (req.method === 'DELETE') {
        const removed = body.text ? forgetMatch(body.text) : memory.length;
        if (!body.text) { memory = []; saveMemoryFS(); }
        return json(res, 200, { ok: true, removed });
      }
      return json(res, 405, { error: 'method' });
    }

    if (p === '/api/assist/reminders') {
      if (req.method === 'GET') return json(res, 200, { items: reminders });
      const body = await ctx.readBody(req).then(b => { try { return JSON.parse(b.toString() || '{}'); } catch (e) { return {}; } });
      if (req.method === 'POST') {
        const r = addReminder(body.text, body.at);
        return r ? json(res, 200, { ok: true, item: r }) : json(res, 400, { error: 'text и at обязательны (ISO)' });
      }
      if (req.method === 'DELETE') {
        const id = body.id || url.searchParams.get('id');
        return json(res, 200, { ok: removeReminder(id) });
      }
      return json(res, 405, { error: 'method' });
    }

    if (p === '/api/assist/events') {
      eventsSSE(req, res);
      return true;
    }

    if (p.startsWith('/api/assist/sys/')) {
      if (p === '/api/assist/sys/volume') {
        const delta = url.searchParams.get('delta') || '+10';
        const r = await volume(delta);
        return json(res, 200, r);
      }
      if (p === '/api/assist/sys/clipboard') {
        const r = await clipboard();
        return json(res, 200, r);
      }
      if (p === '/api/assist/sys/screenshot') {
        const ocr = url.searchParams.get('ocr') === '1' || url.searchParams.get('ocr') === 'true';
        const r = await screenshot(ocr);
        if (r.file) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="screenshot.png"' });
          res.end(fs.readFileSync(r.file));
          try { fs.unlinkSync(r.file); } catch (e) {}
          return true;
        }
        return json(res, 200, r);
      }
      return json(res, 404, { error: 'unknown sys action' });
    }

    if (p === '/api/assist/ollama') {
      return json(res, 200, await ollamaInfo());
    }

    return false;
  }

  return {
    handle,
    getMemoryContext,
    remember,
    addReminder,
    forgetMatch,
    dueReminders,
    engines,
    ollamaInfo
  };
};