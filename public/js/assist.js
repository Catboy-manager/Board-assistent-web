'use strict';

/* assist.js (клиент) — системные возможности ассистента:
   - озвучка ответов через серверный TTS (/api/assist/tts)
   - напоминания: добавление, бейджик, доставка по SSE
   - память: просмотр/добавление/очистка (+ быстрые команды «запомни…»)
   - системные кнопки: скриншот, громкость ±, буфер обмена
   - локальный разбор «запомни/напомни», чтобы не гонять ИИ зря */

(function () {
  if (window.__assistCLI) return;
  window.__assistCLI = true;

  const LS_KEY = 'assistVoice';
  let audio = null;
  let reminders = [];

  function $id(id) { return document.getElementById(id); }
  function toast(title, msg) { try { if (window.APP && window.APP.toast) window.APP.toast(title, msg); } catch (e) {} }

  /* ---------- озвучка ---------- */
  function voiceEnabled() { return localStorage.getItem(LS_KEY) !== '0'; }
  function setVoiceOn(on) {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
    if (!on && audio) { audio.pause(); audio = null; }
    const b = $id('btn-assist-voice');
    if (b) { b.classList.toggle('active', on); b.title = on ? 'Озвучка ответов: вкл. (выкл.)' : 'Озвучка ответов: выкл. (вкл.)'; }
  }
  async function speak(text) {
    if (!voiceEnabled() || !text) return;
    try {
      if (audio) { audio.pause(); audio = null; }
      audio = new Audio('/api/assist/tts?text=' + encodeURIComponent(String(text).slice(0, 400)));
      audio.onerror = () => {};
      audio.play().catch(() => {});
    } catch (e) {}
  }

  /* ---------- напоминания ---------- */
  function refreshBadge() {
    const b = $id('assist-rem-count');
    if (b) { b.textContent = reminders.length ? String(reminders.length) : ''; b.classList.toggle('has', reminders.length > 0); }
    const next = reminders.filter(r => new Date(r.at) > new Date()).sort((a, c) => new Date(a.at) - new Date(c.at))[0];
    const btn = $id('btn-assist-rem');
    if (btn && next) btn.title = 'Напоминания; следующее: ' + new Date(next.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    else if (btn) btn.title = 'Напомнить';
  }
  async function loadReminders() {
    try {
      const r = await fetch('/api/assist/reminders');
      const d = await r.json();
      reminders = d.items || [];
      refreshBadge();
    } catch (e) {}
  }
  function askReminder() {
    const mins = prompt('Напомнить через сколько минут?', '10');
    if (mins == null) return;
    const n = parseInt(mins, 10);
    if (isNaN(n) || n <= 0) { toast('Напоминание', 'Введите число минут'); return; }
    const text = prompt('Что напомнить?', '');
    if (!text) return;
    const at = new Date(Date.now() + n * 60000).toISOString();
    fetch('/api/assist/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, at }) })
      .then(r => r.json()).then(d => {
        if (d.ok) { loadReminders(); toast('Напоминание', '⏰ через ' + n + ' мин: ' + text); }
      }).catch(() => {});
  }
  function initEvents() {
    try {
      const es = new EventSource('/api/assist/events');
      es.onmessage = (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.type === 'reminder') {
          toast('⏰ Напоминание', d.text);
          speak('Напоминание: ' + d.text);
          loadReminders();
        }
      };
      es.onerror = () => {};
    } catch (e) {}
  }

  /* ---------- память ---------- */
  function updateMemBadge() {
    fetch('/api/assist/memory').then(r => r.json()).then(d => {
      const b = $id('assist-mem-count');
      if (b) { b.textContent = d.count ? String(d.count) : ''; b.classList.toggle('has', d.count > 0); }
    }).catch(() => {});
  }
  function askMemory() {
    const what = prompt('Что запомнить?', '');
    if (!what) return;
    fetch('/api/assist/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: what, by: 'user' }) })
      .then(r => r.json()).then(d => { if (d.ok) { toast('Память', '🧠 Запомнил: ' + what); updateMemBadge(); } }).catch(() => {});
  }

  /* ---------- системные кнопки ---------- */
  function screenshot() {
    const a = document.createElement('a');
    a.href = '/api/assist/sys/screenshot';
    a.download = 'screenshot.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Скриншот', 'Скачан screenshot.png');
  }
  function vol(delta) { fetch('/api/assist/sys/volume?delta=' + encodeURIComponent(String(delta))).catch(() => {}); }
  function volUp() { vol('+10'); }
  function volDown() { vol('-10'); }
  async function clipboardToInput() {
    try {
      const r = await fetch('/api/assist/sys/clipboard');
      const d = await r.json();
      if (d.ok && d.text) {
        const inp = $id('ai-text');
        if (inp) { inp.value = (inp.value ? inp.value + ' ' : '') + d.text; inp.focus(); }
      } else toast('Буфер обмена', d.error || 'буфер пуст');
    } catch (e) { toast('Буфер обмена', 'Ошибка'); }
  }

  /* ---------- локальные команды (без ИИ) ---------- */
  const CMD_REMEM = /^(?:запомни|записать|не забудь|память)[\s:]*/i;
  const CMD_REMIND = /^(?:напомни|напомнить)[\s:]*/i;
  async function tryLocal(text, addMsg) {
    const t = String(text || '').trim();
    let m;
    if ((m = t.match(CMD_REMEM))) {
      const fact = t.slice(m[0].length).trim();
      if (!fact) return false;
      try {
        const r = await fetch('/api/assist/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fact, by: 'user' }) });
        const d = await r.json();
        if (d.ok) { addMsg('bot', '🧠 Запомнил: ' + fact); updateMemBadge(); return true; }
      } catch (e) {}
    }
    if ((m = t.match(CMD_REMIND))) {
      const rest = t.slice(m[0].length).trim();
      if (!rest) return false;
      let at = null;
      let mm = rest.match(/через\s+(\d+)\s*мин/);
      if (mm) at = new Date(Date.now() + parseInt(mm[1], 10) * 60000).toISOString();
      if (!at) {
        const hm = rest.match(/(\d{1,2})[:.](\d{2})/);
        if (hm) { const d = new Date(); d.setHours(+hm[1], +hm[2], 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); at = d.toISOString(); }
      }
      if (!at) return false;
      const hint = rest.replace(/через\s+\d+\s*мин/, '').replace(/\b\d{1,2}[:.]\d{2}\b/, '').replace(/[\s,.;:!?]+/g, ' ').trim() || 'Будильник';
      try {
        const r = await fetch('/api/assist/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: hint, at }) });
        const d = await r.json();
        if (d.ok) {
          const when = new Date(at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
            new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
          addMsg('bot', '⏰ Напомню ' + when + ': ' + hint);
          loadReminders();
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  /* ---------- сборка панели инструментов ---------- */
  function buildTools() {
    const traceEl = $id('ai-trace');
    if (!traceEl) return;
    const row = document.createElement('div');
    row.className = 'ai-tools';
    row.innerHTML =
      '<button id="btn-assist-voice" class="icon-btn" title="Озвучка ответов">🔊</button>' +
      '<button id="btn-assist-rem" class="icon-btn" title="Напомнить">⏰<span id="assist-rem-count" class="assist-badge"></span></button>' +
      '<button id="btn-assist-mem" class="icon-btn" title="Память (ПКМ — очистить)">🧠<span id="assist-mem-count" class="assist-badge"></span></button>' +
      '<button id="btn-assist-shot" class="icon-btn" title="Скриншот (скачать)">📸</button>' +
      '<button id="btn-assist-vold" class="icon-btn" title="Громкость ниже">🔉</button>' +
      '<button id="btn-assist-volu" class="icon-btn" title="Громкость выше">🔊</button>' +
      '<span class="ai-tools-spacer"></span>' +
      '<button id="btn-assist-clip" class="icon-btn" title="Буфер обмена → в строку ввода">📋</button>';
    traceEl.insertAdjacentElement('afterend', row);

    $id('btn-assist-voice').onclick = () => { setVoiceOn(!voiceEnabled()); toast('Озвучка', voiceEnabled() ? 'включена 🔊' : 'выключена'); };
    $id('btn-assist-rem').onclick = askReminder;
    $id('btn-assist-mem').onclick = askMemory;
    $id('btn-assist-mem').oncontextmenu = async (e) => {
      e.preventDefault();
      if (!confirm('Очистить всю память ассистента?')) return;
      try { await fetch('/api/assist/memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (err) {}
      updateMemBadge();
      toast('Память', 'очищена');
    };
    $id('btn-assist-shot').onclick = screenshot;
    $id('btn-assist-vold').onclick = volDown;
    $id('btn-assist-volu').onclick = volUp;
    $id('btn-assist-clip').onclick = clipboardToInput;

    setVoiceOn(voiceEnabled());
    loadReminders();
    updateMemBadge();
    initEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildTools);
  else buildTools();

  window.ASSIST = { speak, voiceEnabled, setVoiceOn, tryLocal, updateMemBadge, loadReminders, toast };
})();