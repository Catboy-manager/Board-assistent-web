'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

module.exports = (deps) => {
  const { root, json, dataDir, cfg } = deps;
  const GIT_TIMEOUT = 30000;

  function run(cmd, args, opts) {
    return new Promise((resolve) => {
      execFile(cmd, args, {
        cwd: opts && opts.cwd ? opts.cwd : root,
        timeout: (opts && opts.timeout) || GIT_TIMEOUT,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      }, (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || (err && err.message) || ''),
          error: err ? String((err && err.message) || err) : ''
        });
      });
    });
  }

  function git(args, timeout) {
    return run('git', ['-C', root, ...args], { timeout });
  }

  function isRepo() {
    try { return fs.existsSync(path.join(root, '.git')); } catch (e) { return false; }
  }

  function key() {
    const c = (typeof cfg === 'function' ? cfg() : cfg) || {};
    return String(process.env.KANBAN_UPDATE_KEY || c.updateKey || '');
  }

  function isPrivateIp(raw) {
    const ip = String(raw || '').replace(/^::ffff:/, '');
    if (!ip) return false;
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return true;
    if (/^10\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
    return false;
  }

  function allowed(req) {
    const ip = String(req.socket.remoteAddress || '');
    if (!isPrivateIp(ip)) return false;
    const k = key();
    if (!k) return true;
    return String(req.headers['x-update-key'] || '') === k;
  }

  async function check(refresh) {
    if (!isRepo()) {
      return { ok: true, supported: false, reason: 'not a git repository', root };
    }
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch.code !== 0) {
      return { ok: true, supported: false, reason: branch.stderr.trim() || 'git error', root };
    }
    const fetch = refresh === false ? { code: 0, stderr: '' } : await git(['fetch', '--quiet', 'origin'], 30000);
    const current = await git(['rev-parse', 'HEAD']);
    let upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    let upstreamRef = upstream.code === 0 ? upstream.stdout.trim() : '';
    if (!upstreamRef) upstreamRef = 'origin/' + branch.stdout.trim();
    const latest = await git(['rev-parse', upstreamRef]);
    const behind = await git(['rev-list', '--count', 'HEAD..' + upstreamRef]);
    const ahead = await git(['rev-list', '--count', upstreamRef + '..HEAD']);
    const log = await git(['log', '--format=%h%x09%s%x09%an%x09%ar', '-n', '12', 'HEAD..' + upstreamRef]);
    const dirty = await git(['status', '--porcelain', '-uno']);
    const untracked = await git(['ls-files', '--others', '--exclude-standard']);
    const commits = log.stdout.trim() ? log.stdout.trim().split('\n').map(line => {
      const p = line.split('\t');
      return { hash: p[0] || '', subject: p[1] || '', author: p[2] || '', when: p[3] || '' };
    }) : [];
    return {
      ok: true,
      supported: true,
      root,
      branch: branch.stdout.trim(),
      upstream: upstreamRef,
      current: current.stdout.trim(),
      latest: latest.code === 0 ? latest.stdout.trim() : '',
      behind: parseInt(behind.stdout.trim(), 10) || 0,
      ahead: parseInt(ahead.stdout.trim(), 10) || 0,
      commits,
      dirty: dirty.stdout.trim() ? dirty.stdout.trim().split('\n') : [],
      untracked: untracked.stdout.trim() ? untracked.stdout.trim().split('\n').slice(0, 50) : [],
      fetchError: fetch.code !== 0 ? (fetch.stderr || fetch.error || 'git fetch failed').trim() : '',
      checkedAt: Date.now()
    };
  }

  function scheduleRestart() {
    const desktop = process.env.KANBAN_DESKTOP === '1';
    if (desktop) return { restart: false, reason: 'desktop app: restart required manually' };
    const custom = process.env.KANBAN_UPDATE_RESTART;
    if (custom) {
      setTimeout(() => {
        try {
          const child = spawn('/bin/bash', ['-lc', custom], { detached: true, stdio: 'ignore', env: process.env });
          child.unref();
        } catch (e) {}
        setTimeout(() => process.exit(0), 300);
      }, 900);
      return { restart: true, mode: 'custom' };
    }
    if (process.env.INVOCATION_ID || fs.existsSync('/run/systemd/system')) {
      setTimeout(() => process.exit(0), 900);
      return { restart: true, mode: 'systemd' };
    }
    setTimeout(() => {
      try {
        const child = spawn(process.execPath, [path.join(root, 'server.js')], { detached: true, stdio: 'ignore', env: process.env });
        child.unref();
      } catch (e) {}
      setTimeout(() => process.exit(0), 300);
    }, 1600);
    return { restart: true, mode: 'spawn' };
  }

  async function apply() {
    if (!isRepo()) return { ok: false, supported: false, error: 'not a git repository' };
    const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    const dirty = await git(['status', '--porcelain', '-uno']);
    if (dirty.stdout.trim()) {
      return {
        ok: false,
        error: 'есть незакоммиченные изменения в отслеживаемых файлах — сначала закоммитьте или уберите их',
        dirty: dirty.stdout.trim().split('\n')
      };
    }
    const pull = await git(['pull', '--ff-only'], 120000);
    if (pull.code !== 0) {
      return { ok: false, error: (pull.stderr || pull.error || 'git pull failed').trim(), output: pull.stdout.trim() };
    }
    const after = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    const restart = scheduleRestart();
    return {
      ok: true,
      before,
      after,
      changed: before !== after,
      output: pull.stdout.trim(),
      restart: restart.restart,
      restartMode: restart.mode || '',
      restartNote: restart.reason || ''
    };
  }

  async function handle(p, url, req, res) {
    if (p === '/api/update/check' && req.method === 'GET') {
      if (!allowed(req)) return json(res, 403, { error: 'forbidden' });
      try {
        return json(res, 200, await check(url.searchParams.get('refresh') !== '0'));
      } catch (e) {
        return json(res, 500, { ok: false, error: String((e && e.message) || e) });
      }
    }
    if (p === '/api/update/apply' && req.method === 'POST') {
      if (!allowed(req)) return json(res, 403, { error: 'forbidden' });
      try {
        return json(res, 200, await apply());
      } catch (e) {
        return json(res, 500, { ok: false, error: String((e && e.message) || e) });
      }
    }
    if (p === '/api/update/key' && req.method === 'GET') {
      return json(res, 200, { required: Boolean(key()) });
    }
    return false;
  }

  return { handle, check, apply };
};
