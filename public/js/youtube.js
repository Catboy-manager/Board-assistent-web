'use strict';

/* Панель YouTube: поиск, окно с видео, очередь с автоплеем.
   «Вход в Google» — без OAuth: загружается cookies.txt из браузера,
   где уже вошёл в свой аккаунт (расширение «Get cookies.txt» → экспорт),
   либо сервер берёт cookies из профиля браузера (Chrome/Firefox). */

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const QUEUE_KEY = 'kban-yt-queue';

  let queue = [];
  let cur = null;
  let playingUrl = '';
  const recFlagged = {};
  try { const d = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); if (Array.isArray(d)) queue = d; } catch (e) {}
  const saveQ = () => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) {} };

  const thumbUrl = u => u ? '/api/yt/thumb?u=' + encodeURIComponent(u) : '';

  /* ---------- сборка интерфейса ---------- */
  function build() {
    const pane = $('sp-yt');
    if (!pane || pane.dataset.built) return;
    pane.dataset.built = '1';
    pane.innerHTML = `
      <div id="yt-auth" class="yt-oauth"></div>
      <div class="yt-row">
        <input id="yt-q" class="yt-q" type="search" placeholder="Поиск на YouTube…" autocomplete="off">
        <button id="yt-go" class="icon-btn" title="Искать">🔍</button>
      </div>
      <div id="yt-res" class="yt-res"><div class="empty-state">Например: «лекции по математике» 🔍</div></div>
      <div class="yt-player">
        <video id="yt-video" controls preload="metadata"></video>
        <div id="yt-now" class="yt-now"></div>
      </div>
      <div class="yt-queue">
        <div class="yt-qhead"><b>Очередь <span id="yt-qcount"></span></b></div>
        <div id="yt-queue" class="yt-queue-list"></div>
      </div>`;
    $('yt-go').onclick = () => search($('yt-q').value);
    $('yt-q').addEventListener('keydown', e => { if (e.key === 'Enter') search($('yt-q').value); });
    const v = $('yt-video');
    v.addEventListener('ended', () => { recordWatch(cur, true); next(); });
    v.addEventListener('timeupdate', () => recordWatch(cur, false));
    v.addEventListener('error', () => { if (v.currentSrc) { const t = $('yt-now'); if (t) t.textContent = '⚠️ Не удалось воспроизвести (сеть?)'; } });
    renderQueue();
    authStatus();
  }

  /* ---------- вход в Google ---------- */
  async function authStatus() {
    const box = $('yt-auth');
    if (!box) return;
    let d = null;
    try { const r = await fetch('/api/yt/auth/status'); d = await r.json(); } catch (e) {}
    if (!d) { box.innerHTML = '<span class="yt-oa-na">Ошибка статуса входа</span>'; return; }

    let mode = '';
    if (d.cookies) mode = 'cookies.txt (' + Math.round(d.cookieSize / 1024) + ' КБ)';
    else if (d.browser) mode = 'профиль браузера ' + (d.browser === 'firefox' ? 'Firefox' : 'Chrome');

    if (mode) {
      box.innerHTML = `<span class="yt-oa-ok">👤 Вход активен: ${esc(mode)}</span>
        <button class="btn mini" id="yt-cc">Заменить cookies</button>
        <button class="btn mini link" id="yt-clr">Сбросить вход</button>
        <input type="file" id="yt-cfile" accept=".txt,text/plain" hidden>`;
      $('yt-cc').onclick = () => $('yt-cfile').click();
      $('yt-clr').onclick = async () => { await fetch('/api/yt/auth/clear', { method: 'POST' }); authStatus(); };
      const f = $('yt-cfile');
      f.onchange = async () => { if (f.files[0]) await uploadCookies(f.files[0]); authStatus(); };
      return;
    }
    box.innerHTML = `
      <span class="yt-oa-na">Вход в Google: без OAuth — через cookies браузера, где ты уже вошёл(а).</span>
      <button class="btn mini" id="yt-cc">📄 Загрузить cookies.txt</button>
      <button class="btn mini link" id="yt-br">Использовать профиль браузера…</button>
      <input type="file" id="yt-cfile" accept=".txt,text/plain,text/XP,text/NS" hidden>
      <div id="yt-browser-box" class="hidden yt-browser-box">
        <button class="btn mini" data-br="chrome">Chrome</button>
        <button class="btn mini" data-br="firefox">Firefox</button>
      </div>
      <div class="hint yt-hint">Расширение «Get cookies.txt» → Export → загрузить файл. Либо указать браузер, где открыт gmail/youtube (браузер должен быть закрыт).</div>`;
    $('yt-cc').onclick = () => $('yt-cfile').click();
    const f = $('yt-cfile');
    f.onchange = async () => { if (f.files[0]) await uploadCookies(f.files[0]); authStatus(); };
    $('yt-br').onclick = () => { const b = $('yt-browser-box'); if (b) b.classList.toggle('hidden'); };
    document.querySelectorAll('#yt-browser-box [data-br]').forEach(b => {
      b.onclick = async () => {
        await fetch('/api/yt/auth/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser: b.dataset.br }) });
        authStatus();
      };
    });
  }

  async function uploadCookies(file) {
    try {
      const r = await fetch('/api/yt/auth/cookies', { method: 'POST', body: file });
      const d = await r.json();
      if (!d.ok) alert('Ошибка: ' + (d.error || 'не загрузилось'));
    } catch (e) { alert('Ошибка сети'); }
  }

  /* ---------- поиск ---------- */
  async function search(q) {
    q = String(q || '').trim();
    const res = $('yt-res');
    if (!q) return;
    res.innerHTML = '<div class="empty-state">Ищу…</div>';
    try {
      const r = await fetch('/api/yt/search?q=' + encodeURIComponent(q));
      const d = await r.json();
      if (!d.items || !d.items.length) { res.innerHTML = '<div class="empty-state">Ничего не нашлось</div>'; return; }
      res.innerHTML = d.items.map((it, i) => row(it, i)).join('');
      res.querySelectorAll('.yt-rrow').forEach((el, i) => {
        const it = d.items[i];
        el.onclick = () => { playNow(it); highlight(el); };
      });
    } catch (e) {
      res.innerHTML = '<div class="empty-state">Ошибка поиска</div>';
    }
  }

  function row(it, i) {
    const th = thumbUrl(it.thumb);
    return `<div class="yt-rrow" data-i="${i}" title="${esc(it.title)}">
      <div class="yt-th">${th ? '<img src="' + esc(th) + '" loading="lazy" alt="">' : '<span class="yt-phi">▶</span>'}</div>
      <div class="yt-meta">
        <div class="yt-t">${esc(it.title || '')}${it.dur ? ' <span class="yt-dur">' + esc(it.dur) + '</span>' : ''}</div>
        <div class="yt-c">${esc(it.channel || '')}</div>
      </div>
      <div class="yt-play" title="Играть">▶</div>
    </div>`;
  }

  function highlight(el) {
    document.querySelectorAll('.yt-rrow').forEach(x => x.classList.remove('sel'));
    if (el) el.classList.add('sel');
  }

  /* ---------- учёт просмотра (для карты интересов) ---------- */
  function recordWatch(obj, force) {
    if (!obj || !obj.id || recFlagged[obj.id]) return;
    const vd = $('yt-video');
    if (!vd) return;
    const dur = isFinite(vd.duration) ? vd.duration : 0;
    const watched = vd.currentTime || 0;
    if (!force && (dur <= 0 || watched < dur * 0.6)) return;
    recFlagged[obj.id] = 1;
    fetch('/api/yt/watch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: obj.id, title: obj.title || '', channel: obj.channel || '', dur: Math.round(dur), watchedSec: Math.round(watched) })
    }).catch(() => {});
  }

  /* ---------- поток ---------- */
  async function playNow(v) {
    if (!v || !v.id) return;
    const obj = { id: v.id, title: v.title || '', channel: v.channel || '', dur: v.dur || '', fmt: null };
    const t = $('yt-now');
    if (t) { t.textContent = '▶ ' + obj.title; t.title = obj.title; }
    play(obj);
  }

  function play(obj) {
    const vd = $('yt-video');
    if (!vd) return;
    cur = obj;
    recFlagged[obj.id] = undefined;
    const src = '/api/yt/stream?id=' + encodeURIComponent(obj.id) + '&fmt=' + (obj.fmt ? encodeURIComponent(obj.fmt) : 'best');
    if (src === playingUrl) { vd.play().catch(() => {}); return; }
    playingUrl = src;
    vd.src = src;
    vd.play().catch(() => {});
  }

  function next() {
    if (!queue.length) { cur = null; playingUrl = ''; const vd = $('yt-video'); if (vd) vd.removeAttribute('src'); return; }
    const it = queue[0];
    queue.shift();
    saveQ();
    play(it);
    renderQueue();
  }

  /* ---------- очередь ---------- */
  function enqueue(v) {
    const it = { id: v.id, title: v.title || '', dur: v.dur || '', fmt: null };
    queue.push(it);
    saveQ();
    renderQueue();
  }

  function renderQueue() {
    const box = $('yt-queue');
    const cnt = $('yt-qcount');
    if (cnt) cnt.textContent = queue.length ? '(' + queue.length + ')' : '';
    if (!box) return;
    if (!queue.length) { box.innerHTML = '<div class="empty-state">Очередь пуста</div>'; return; }
    box.innerHTML = queue.map((it, i) => `
      <div class="yt-qrow" title="${esc(it.title)}">
        <button class="icon-btn q-cmd" data-a="up" data-i="${i}" title="Выше">▲</button>
        <button class="icon-btn q-cmd" data-a="down" data-i="${i}" title="Ниже">▼</button>
        <button class="icon-btn q-cmd" data-a="del" data-i="${i}" title="Убрать">✕</button>
        <span class="yt-qw">${esc(it.dur || '')}</span>
        <span class="yt-qt">${esc(it.title || '')}</span>
      </div>`).join('');
    box.querySelectorAll('.q-cmd').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const i = +b.dataset.i, a = b.dataset.a;
        if (a === 'del') queue.splice(i, 1);
        else if (a === 'up' && i > 0) { const x = queue[i]; queue[i] = queue[i - 1]; queue[i - 1] = x; }
        else if (a === 'down' && i < queue.length - 1) { const x = queue[i]; queue[i] = queue[i + 1]; queue[i + 1] = x; }
        saveQ(); renderQueue();
      };
    });
  }

  function load() { build(); }

  window.YT = { load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();