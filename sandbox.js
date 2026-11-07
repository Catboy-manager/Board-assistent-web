'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

module.exports = (deps) => {
  const { json, readBody } = deps;

  const BWRAP = process.env.KANBAN_BWRAP || '/usr/bin/bwrap';
  const MAX_CODE = 200 * 1024;
  const MAX_OUT = 256 * 1024;
  const MAX_TIMEOUT = 30000;
  const DEFAULT_TIMEOUT = 10000;

  const LANGS = {
    python: { bin: process.env.KANBAN_PYTHON || '/usr/bin/python3', args: (f) => ['-I', '-B', f], ext: '.py' },
    node: { bin: process.execPath, args: (f) => [f], ext: '.js' },
    bash: { bin: '/bin/bash', args: (f) => ['--noprofile', '--norc', f], ext: '.sh' }
  };

  const active = new Map();

  function bwrapAvailable() {
    try { fs.accessSync(BWRAP, fs.constants.X_OK); return true; } catch (e) { return false; }
  }

  function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }

  function run(cmd, args, opts) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      let outSize = 0;
      let errSize = 0;
      let truncated = false;
      let timedOut = false;
      let done = false;
      const started = Date.now();

      const finish = (code, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          if (process.platform !== 'win32' && child.pid) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {}
          }
        } catch (e) {}
        resolve({ code, stdout, stderr, timedOut, truncated, ms: Date.now() - started, error });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch (e) {}
      }, opts.timeout);

      child.stdout.on('data', (b) => {
        outSize += b.length;
        if (outSize <= MAX_OUT) stdout += b.toString('utf8');
        else {
          truncated = true;
          try {
            if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
            else child.kill('SIGKILL');
          } catch (e) {}
        }
      });
      child.stderr.on('data', (b) => {
        errSize += b.length;
        if (errSize <= MAX_OUT) stderr += b.toString('utf8');
        else { truncated = true; }
      });
      child.on('error', (e) => finish(null, String((e && e.message) || e)));
      child.on('close', (code) => finish(code));
      try {
        if (opts.input) child.stdin.write(opts.input);
        child.stdin.end();
      } catch (e) {}
    });
  }

  function sandboxEnv(dir) {
    return {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: dir,
      TMPDIR: dir,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
      NODE_OPTIONS: '--max-old-space-size=128'
    };
  }

  function bwrapArgs(dir, lang) {
    const l = LANGS[lang];
    const args = ['--die-with-parent'];
    for (const p of ['/usr', '/lib', '/lib64', '/bin', '/sbin']) {
      if (fs.existsSync(p)) args.push('--ro-bind', p, p);
    }
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp');
    args.push('--unshare-net');
    args.push('--ro-bind', dir, '/work', '--chdir', '/work');
    args.push(l.bin, ...l.args('main' + l.ext));
    return args;
  }

  function looksLikeBwrapFailure(r) {
    const s = String(r.stderr || '');
    return r.code === 1 && !r.stdout && /bwrap:|Creating new namespace|No permissions to creating new namespace|Operation not permitted/i.test(s);
  }

  async function execute(lang, code, input, timeout) {
    const l = LANGS[lang];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kban-sandbox-'));
    const file = path.join(dir, 'main' + l.ext);
    try {
      fs.writeFileSync(file, code, { mode: 0o600 });
      const env = sandboxEnv(dir);
      let isolated = false;
      let r;
      if (bwrapAvailable()) {
        r = await run(BWRAP, bwrapArgs(dir, lang), { cwd: dir, env, input, timeout });
        isolated = !looksLikeBwrapFailure(r);
        if (!isolated && !r.timedOut && !r.truncated) {
          r = await run(l.bin, l.args(file), { cwd: dir, env, input, timeout });
          r.warning = 'bwrap недоступен — запущено без изоляции';
        }
      } else {
        r = await run(l.bin, l.args(file), { cwd: dir, env, input, timeout });
        r.warning = 'bwrap не найден — запущено без изоляции';
      }
      return {
        ok: !r.timedOut && r.code === 0,
        code: r.code,
        stdout: r.stdout,
        stderr: r.stderr,
        ms: r.ms,
        timedOut: !!r.timedOut,
        truncated: !!r.truncated,
        isolated: isolated,
        warning: r.warning || '',
        error: r.error || ''
      };
    } finally {
      cleanup(dir);
    }
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/sandbox/info') {
      const langs = [];
      for (const [key, l] of Object.entries(LANGS)) {
        try { fs.accessSync(l.bin, fs.constants.X_OK); langs.push(key); } catch (e) {}
      }
      return json(res, 200, {
        ok: true,
        bwrap: bwrapAvailable(),
        langs,
        defaultTimeout: DEFAULT_TIMEOUT,
        maxTimeout: MAX_TIMEOUT,
        maxCode: MAX_CODE
      });
    }

    if (req.method === 'POST' && p === '/api/sandbox/run') {
      const ip = String(req.socket.remoteAddress || '');
      const now = Date.now();
      const prev = active.get(ip) || [];
      const recent = prev.filter(t => now - t < 60000);
      if (recent.length >= 20) return json(res, 429, { error: 'слишком много запусков, подождите минуту' });

      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const lang = String(body.lang || 'python');
      const code = String(body.code || '');
      const input = String(body.stdin || '').slice(0, 64 * 1024);
      if (!LANGS[lang]) return json(res, 400, { error: 'неизвестный язык' });
      if (!code.trim()) return json(res, 400, { error: 'пустой код' });
      if (Buffer.byteLength(code) > MAX_CODE) return json(res, 413, { error: 'код слишком большой' });
      let timeout = Number(body.timeout) || DEFAULT_TIMEOUT;
      timeout = Math.max(1000, Math.min(MAX_TIMEOUT, timeout));

      recent.push(now);
      active.set(ip, recent);
      try {
        const out = await execute(lang, code, input, timeout);
        return json(res, 200, out);
      } catch (e) {
        return json(res, 500, { error: String((e && e.message) || e) });
      }
    }

    return false;
  }

  return { handle };
};
