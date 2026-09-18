'use strict';

(function () {
  let tracks = [];
  let cur = -1;
  let shuffle = false;
  let history = [];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fmt(size) {
    if (!size) return '';
    if (size > 1048576) return (size / 1048576).toFixed(0) + ' МБ';
    return (size / 1024).toFixed(0) + ' КБ';
  }

  function toast(title, msg, warn) {
    try { if (window.APP && window.APP.toast) window.APP.toast(title, msg, warn); } catch (e) {}
  }

  async function deleteTrack(i) {
    const t = tracks[i];
    if (!t) return;
    if (!window.confirm('Удалить файл «' + (t.name || t.path) + '»?')) return;
    try {
      const audio = $('mu-audio');
      if (audio && cur === i) { audio.pause(); audio.src = ''; }
      const r = await fetch('/api/music/delete?path=' + encodeURIComponent(t.path), { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        tracks.splice(i, 1);
        if (cur >= tracks.length) cur = tracks.length - 1;
        toast('Музыка', 'Удалено: ' + t.name);
        load();
      } else toast('Музыка', (d.error || 'ошибка') + ' — ' + t.name, true);
    } catch (e) { toast('Музыка', 'Ошибка удаления: ' + e.message, true); }
  }

  async function uploadTrack(file) {
    try {
      const r = await fetch('/api/music/upload?name=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) toast('Загрузка', '✓ Трек сохранён: ' + file.name);
      else toast('Загрузка', (d.error || 'ошибка') + ' — ' + file.name, true);
    } catch (e) {
      toast('Загрузка', 'Ошибка: ' + e.message, true);
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/music');
      const d = await r.json();
      tracks = d.tracks || [];
      const box = $('sw-music');
      if (!box) return;
      box.innerHTML = `
        <div class="mu-head">
          <div class="mu-now">${tracks.length ? renderNow() : 'Нет файлов'}</div>
          <button class="icon-btn mu-btn" id="mu-upload" title="Загрузить треки с этого устройства">⤴</button>
          <button class="icon-btn mu-btn" id="mu-shuffle" title="Перемешать">🔀</button>
        </div>
        <input type="file" id="mu-file" accept="audio/*" multiple hidden>
        <audio id="mu-audio" preload="metadata"></audio>
        <div class="mu-controls">
          <button class="icon-btn" id="mu-prev" title="Предыдущий">⏮</button>
          <button class="icon-btn grad play" id="mu-play" title="Играть / пауза">▶</button>
          <button class="icon-btn" id="mu-next" title="Следующий">⏭</button>
        </div>
        <div class="mu-progress">
          <span class="mu-t" id="mu-cur">0:00</span>
          <div class="mu-track" id="mu-track"><div class="mu-fill" id="mu-fill"></div></div>
          <span class="mu-t" id="mu-dur">0:00</span>
        </div>
        <div class="mu-list" id="mu-list">${tracks.map(muRow).join('')}</div>`;
      bind();
    } catch (e) {
      const box = $('sw-music');
      if (box) box.innerHTML = '<div class="empty-state">Музыка недоступна</div>';
    }
  }

  function muRow(t, i) {
    const name = String(t.name || t.path || '');
    const isCur = i === cur;
    return `<div class="mu-row${isCur ? ' on' : ''}" data-i="${i}" title="${esc(t.path)}">
      <span class="mu-icon">${isCur ? '🔊' : '🎵'}</span>
      <span class="mu-name">${esc(name)}</span>
      <span class="mu-size">${fmt(t.size)}</span>
      <button class="mu-del" data-del="${i}" title="Удалить файл">🗑</button>
    </div>`;
  }

  function renderNow() {
    if (cur < 0 || !tracks[cur]) return '<div class="empty-state">Выберите трек</div>';
    const t = tracks[cur];
    return `<div class="mu-nowico">🎵</div><div class="mu-nm">${esc(t.name || t.path)}</div>`;
  }

  function renderList() {
    const list = $('mu-list');
    if (list) list.innerHTML = tracks.map(muRow).join('').toString();
  }

  function bind() {
    const audio = $('mu-audio');
    if (!audio) return;
    $('mu-play').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
    $('mu-next').onclick = () => step(1);
    $('mu-prev').onclick = () => step(-1, true);
    $('mu-shuffle').onclick = () => { shuffle = !shuffle; $('mu-shuffle').classList.toggle('on', shuffle); };
    const up = $('mu-upload');
    const fi = $('mu-file');
    if (up && fi) {
      up.onclick = () => { fi.click(); };
      fi.addEventListener('change', async () => {
        const files = Array.from(fi.files || []);
        if (!files.length) return;
        for (const f of files) {
          await uploadTrack(f);
        }
        fi.value = '';
        load();
      });
    }
    $('mu-track').onclick = (e) => {
      if (!audio.duration) return;
      const rect = $('mu-track').getBoundingClientRect();
      audio.currentTime = (e.clientX - rect.left) / rect.width * audio.duration;
    };
    audio.addEventListener('loadedmetadata', () => { $('mu-dur').textContent = fmtT(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      $('mu-cur').textContent = fmtT(audio.currentTime);
      const pct = audio.duration ? (audio.currentTime / audio.duration * 100) + '%' : '0%';
      $('mu-fill').style.width = pct;
    });
    audio.addEventListener('play', () => { $('mu-play').textContent = '⏸'; });
    audio.addEventListener('pause', () => { $('mu-play').textContent = '▶'; });
    audio.addEventListener('ended', () => step(1));
    audio.addEventListener('error', () => step(1));

    const listEl = $('mu-list');
    if (listEl) {
      listEl.onclick = (e) => {
        const del = e.target.closest('.mu-del');
        if (del) { deleteTrack(Number(del.dataset.del)); return; }
        const row = e.target.closest('.mu-row');
        if (row) selectTrack(Number(row.dataset.i));
      };
    }
  }

  function fmtT(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60), sec = String(s % 60).padStart(2, '0');
    return m + ':' + sec;
  }

  function selectTrack(i, play = true) {
    const was = cur;
    cur = i;
    if (shuffle && cur !== was) history.push(was);
    renderNow();
    renderList();
    const audio = $('mu-audio');
    if (!audio) return;
    audio.src = '/api/music/stream?path=' + encodeURIComponent(tracks[i].path);
    if (play) audio.play().catch(() => {});
  }

  function step(dir, backToHistory = false) {
    if (!tracks.length) return;
    if (shuffle) {
      if (dir > 0 || backToHistory) {
        if (history.length) { selectTrack(history.pop()); return; }
      }
      let i = Math.floor(Math.random() * tracks.length);
      if (tracks.length > 1 && i === cur) i = (i + 1) % tracks.length;
      selectTrack(i);
      return;
    }
    selectTrack((cur + dir + tracks.length) % tracks.length);
  }

  window.WIDGET = window.WIDGET || {};
  const prevTab = window.WIDGET.tab;
  window.WIDGET.tab = function (name) {
    if (prevTab) prevTab(name);
    if (name === 'music') load();
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sw-tab').forEach(t => t.onclick = () => window.WIDGET.tab(t.dataset.tab));
    const togg = $('sw-toggle');
    if (togg) togg.onclick = () => window.WIDGET.minim();
  });

  window.MUSIC = { load };
})();