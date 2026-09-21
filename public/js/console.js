'use strict';

(function () {
  const $ = id => document.getElementById(id);
  let key = '';
  let streamAbort = null;
  let reTimer = null;
  const hist = [];
  let hIdx = -1;
  let connAttempts = 0;

  async function fetchKey() {
    try {
      const r = await fetch('/api/console/key');
      if (r.status === 403) return { error: true };
      const d = await r.json();
      return { key: d.key || '' };
    } catch (e) {
      return { key: '' };
    }
  }

  function headers() {
    return key ? { 'Content-Type': 'application/json', 'X-Console-Key': key } : { 'Content-Type': 'application/json' };
  }

  async function load() {
    const box = $('sp-console');
    if (!box) return;
    if (box.dataset.init) { if ($('con-restart')) reopen(); return; }
    box.dataset.init = '1';
    box.innerHTML = `
      <div class="sw-news-bar">
        <span class="sw-gh-title">🖥 Консоль сервера</span>
        <button class="icon-btn sw-mini" id="con-restart" title="Перезапустить шелл">⟳</button>
        <button class="icon-btn sw-mini grad" id="con-clear" title="Очистить экран">⌫</button>
      </div>
      <div class="con-out" id="con-out"><div class="empty-state">подключение…</div></div>
      <div class="con-in-wrap">
        <span class="con-ps">$</span>
        <input id="con-in" class="con-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="команда… (Enter — выполнить)">
      </div>`;
    $('con-restart').onclick = async () => {
      try { await fetch('/api/console/restart', { method: 'POST', headers: headers(), body: '{}' }); } catch (e) {}
      writeLine('<span class="con-exit">· шелл перезапускается</span>');
    };
    $('con-clear').onclick = () => { const o = $('con-out'); if (o) o.innerHTML = ''; };
    const inp = $('con-in');
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const v = inp.value.trim();
        if (v) { hist.push(v); hIdx = hist.length; }
        try {
          await fetch('/api/console/input', { method: 'POST', headers: headers(), body: JSON.stringify({ data: v + '\n' }) });
        } catch (err) {}
        inp.value = '';
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (hist.length) { hIdx = Math.max(0, hIdx - 1); inp.value = hist[hIdx]; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        hIdx = Math.min(hist.length, hIdx + 1);
        inp.value = hIdx < hist.length ? hist[hIdx] : '';
      }
    });
    reopen();
  }

  function reopen() {
    if (streamAbort) { try { streamAbort.abort(); } catch (e) {} streamAbort = null; }
    if (reTimer) { clearTimeout(reTimer); reTimer = null; }
    connect();
  }

  function writeLine(t) {
    const o = $('con-out');
    if (!o) return;
    const atBottom = o.scrollHeight - o.scrollTop - o.clientHeight < 40;
    o.insertAdjacentHTML('beforeend', t);
    if (atBottom) o.scrollTop = o.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function connect() {
    const o = $('con-out');
    const kr = await fetchKey();
    if (kr.error) {
      if (o) o.innerHTML = '<div class="empty-state">⚠️ Консоль закрыта</div><div class="hint">Ключ консоли доступен только из локальной сети — зайдите с устройства во внутренней сети.</div>';
      return;
    }
    key = kr.key;
    try {
      const st = await fetch('/api/console/state', { headers: headers() });
      if (st.status === 403) {
        if (o) o.innerHTML = '<div class="empty-state">⚠️ Консоль закрыта</div><div class="hint">Чтобы открыть доступ с LAN, задайте consoleKey в config.json (KANBAN_CONSOLE_KEY).</div>';
        return;
      }
      const inp = $('con-in');
      if (inp) inp.disabled = false;
      stream();
    } catch (e) {
      if (o) o.innerHTML = '<div class="empty-state">Не удалось открыть консоль</div>';
    }
  }

  async function stream() {
    const o = $('con-out');
    if (o) o.innerHTML = '<div class="empty-state">подключение…</div>';
    streamAbort = new AbortController();
    try {
      const res = await fetch('/api/console/events', {
        headers: key ? { 'Accept': 'text/event-stream', 'X-Console-Key': key } : { 'Accept': 'text/event-stream' },
        signal: streamAbort.signal
      });
      if (res.status === 403) {
        if (o) o.innerHTML = '<div class="empty-state">⚠️ Нет доступа к консоли</div>';
        return;
      }
      if (!res.body) { scheduleReconnect(2000); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder('utf-8');
      let buf = '';
      const inp = $('con-in');
      if (inp) inp.disabled = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
          if (!dataLine) continue;
          try {
            const d = JSON.parse(dataLine);
            if (d.type === 'out') writeLine(escapeHtml(String(d.data || '')));
            else if (d.type === 'start') writeLine('<span class="con-start">· шелл запущен</span>');
            else if (d.type === 'exit') writeLine('<span class="con-exit">· шелл завершился' + (d.code != null ? ' (код ' + d.code + ')' : '') + '</span>');
          } catch (e) {}
        }
      }
      scheduleReconnect(3000);
    } catch (e) {
      if (e.name !== 'AbortError') scheduleReconnect(3000);
    }
  }

  function scheduleReconnect(ms) {
    const box = $('sp-console');
    if (!box || !box.dataset.init) return;
    connAttempts++;
    const delay = Math.min(ms * connAttempts, 10000);
    reTimer = setTimeout(() => { stream(); }, delay);
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.CONS = { load };
  });
})();