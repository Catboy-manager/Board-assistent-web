'use strict';

/* Wake-word прослушивание («Саша», «Саня», «Александр»…).
   - Chromium/Chrome/Safari: Web Speech API (распознавание в браузере).
   - Firefox: фолбэк через локальный серверный STT (/api/stt, faster-whisper).
   Требуется безопасный контекст: лучше открывать http://localhost:8080. */

(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let supported = !!SR && localStorage.getItem('srBroken') !== '1';
  const KEY = 'wakeEnabled';
  const WAKE = /(саш[аеуио]*|сань[ауие]?|саня|санек|александр[аоу]*|александра|александровна|алекс|шура?)/i;
  const ARMED_MS = 8000;

  let enabled = localStorage.getItem(KEY) !== '0';
  let rec = null;
  let armed = false;
  let disarmTimer = null;
  let currentWake = '';

  // ресурсы Firefox-фолбэка
  let ffStream = null;
  let ffRec = null;
  let ffTimer = null;
  let ffBusy = false;
  let ffParts = [];
  let ffLoud = { at: 0, level: 0 };
  let ffLoudTimer = null;
  let lastFfSent = 0;
  let recentText = [];

  const btn = document.getElementById('btn-wake');
  const ind = document.getElementById('wake-ind');
  const trace = (s, m) => window.TRACE && window.TRACE(s, m);

  function toast(msg, title) {
    console.log('[wake]', title || '', msg);
    try { if (window.APP && window.APP.toast) window.APP.toast(title || '🎤', msg); } catch (e) {}
  }

  function insecure() {
    return typeof window.isSecureContext !== 'undefined' && !window.isSecureContext;
  }

  function updateUI() {
    const active = !!rec || !!ffRec;
    if (ind) ind.classList.toggle('active', enabled && active);
    if (btn) {
      if (insecure()) {
        btn.title = 'Откройте http://localhost:8080 для голоса';
        btn.classList.add('disabled');
      } else if (!supported) {
        btn.title = enabled ? 'Прослушивание через сервер (Firefox-режим) — выкл.' : 'Всегда слушать: «Саша» / «Саня» / «Александр»';
        btn.classList.remove('disabled');
      } else if (!enabled) {
        btn.title = 'Прослушивание выключено — «Саша» / «Саня» / «Александр»';
        btn.classList.remove('disabled');
      } else {
        btn.title = 'Прослушивание включено (выкл.)';
        btn.classList.remove('disabled');
      }
    }
  }

  /* --- единая обработка распознанного текста --- */
  function handleTranscript(raw) {
    if (!enabled) return;
    const tr = (raw || '').replace(/\s+/g, ' ').trim();
    const low = tr.toLowerCase().replace(/ё/g, 'е');
    if (!low) return;

    if (!armed) {
      const m = low.match(WAKE);
      if (m) {
        currentWake = m[0];
        const rest = stripWake(tr, m[0]);
        if (rest) fire(rest);
        else {
          armed = true;
          clearTimeout(disarmTimer);
          disarmTimer = setTimeout(() => { armed = false; currentWake = ''; }, ARMED_MS);
        }
      }
    } else {
      const rest = stripWake(tr, currentWake);
      if (rest) {
        armed = false;
        currentWake = '';
        clearTimeout(disarmTimer);
        fire(rest);
      }
    }
  }

  function stripWake(text, wake) {
    if (!wake) return '';
    let idx = text.toLowerCase().replace(/ё/g, 'е').indexOf(wake.toLowerCase());
    if (idx < 0) return text;
    return text.slice(idx + wake.length).replace(/^[\s,.:;!?—–-]+/, '').trim();
  }

  function fire(command) {
    toast('«' + command + '»', '🎯');
    trace('wake', 'Команда: «' + command + '»');
    try {
      const panel = document.getElementById('ai-panel');
      if (panel) panel.classList.remove('hidden');
      if (window.AI) window.AI.run(command, true);
      else { window.AI_INIT(); setTimeout(() => window.AI && window.AI.run(command, true), 300); }
    } catch (e) { console.error(e); }
  }

  /* --- Chromium: Web Speech API --- */
  function startSR() {
    if (!enabled || !supported || rec) return;
    let r;
    try { r = new SR(); } catch (e) { return; }
    rec = r;
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!armed || res.isFinal) handleTranscript(res[0].transcript || '');
      }
    };

    r.onerror = (e) => {
      rec = null;
      if (!enabled) return;
      if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
        enabled = false;
        localStorage.setItem(KEY, '0');
        updateUI();
        trace('mic', 'Wake: микрофон запрещён (' + e.error + ')');
        toast('Разрешите микрофон и включите 🎤 в шапке', '🎤 Нет доступа к микрофону');
        return;
      }
      if (e && e.error === 'network') {
        // браузерное распознавание недоступно в этой сети (обычно РФ/офис) — переходим на серверное
        window.__srBroken = true;
        try { localStorage.setItem('srBroken', '1'); } catch (err) {}
        supported = false;
        rec = null;
        updateUI();
        trace('mic', 'Wake: браузерное распознавание недоступно в этой сети — серверный режим');
        if (enabled && !chatVoice) setTimeout(startFf, 300);
        return;
      }
      // повторяем
      setTimeout(() => { rec = null; if (enabled && supported && !chatVoice && !rec) startSR(); }, 1500);
    };

    r.onend = () => { rec = null; if (enabled && !chatVoice) setTimeout(() => startSR(), 500); };

    try { r.start(); updateUI(); } catch (err) { rec = null; }
  }

  /* --- Firefox: серверное распознавание (MediaRecorder → /api/stt) --- */
  function startFf() {
    if (!enabled || supported || ffRec) return;
    if (insecure()) { toast('Микрофон недоступен: откройте http://localhost:8080', '🎤'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Нет микрофона в браузере', '🎤'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      ffStream = stream;
      trace('mic', 'Wake: доступ к микрофону получен');
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || 'audio/webm';
      ffParts = [];
      recentText = [];
      ffRec = new MediaRecorder(stream, { mimeType: mime });
      ffRec.ondataavailable = (e) => { if (e.data && e.data.size) ffParts.push(e.data); };
      ffRec.start(3000);
      ffTimer = setInterval(ffChunk, 3500);
      ffLoud = { at: 0, level: 0 };
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          const actx = window.__wkActx || (window.__wkActx = new Ctx());
          if (actx.state === 'suspended') actx.resume();
          const analyser = actx.createAnalyser();
          analyser.fftSize = 1024;
          const src = actx.createMediaStreamSource(stream);
          src.connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          ffLoudTimer = setInterval(() => {
            try {
              analyser.getByteTimeDomainData(buf);
              let s = 0;
              for (let i = 0; i < buf.length; i += 8) { const v = (buf[i] - 128) / 128; s += v * v; }
              ffLoud = { at: Date.now(), level: Math.sqrt(s / (buf.length / 8)) };
            } catch (e) {}
          }, 200);
        }
      } catch (e) {}
      updateUI();
    }).catch((err) => {
      console.error('[wake] ff mic error', err);
      ffStream = ffRec = null;
      enabled = false;
      localStorage.setItem(KEY, '0');
      updateUI();
      toast('Разрешите микрофон и включите 🎤 в шапке', '🎤 Нет доступа к микрофону');
    });
  }

  async function ffChunk() {
    if (!enabled || !ffRec || ffBusy || ffParts.length === 0) return;
    const silentFor = Date.now() - ffLoud.at;
    const speaking = ffLoud.level > 0.02 || silentFor > 6000;
    if (!speaking && Date.now() - lastFfSent < 12000) {
      ffParts.splice(0, ffParts.length);
      return;
    }
    ffBusy = true;
    lastFfSent = Date.now();
    const mime = ffRec.mimeType || 'audio/webm';
    try {
      const blob = new Blob(ffParts.splice(0, ffParts.length), { type: mime });
      if (blob.size > 500) {
        const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl, mime }) });
        const d = await r.json();
        if (d.text && d.text.trim()) {
          recentText.push(d.text.trim());
          if (recentText.length > 4) recentText.shift();
          handleTranscript(recentText.join(' '));
        }
      }
    } catch (e) {
      console.warn('[wake] stt chunk error', e);
    } finally {
      ffBusy = false;
    }
  }

  function stopFf() {
    clearInterval(ffTimer);
    clearInterval(ffLoudTimer);
    ffTimer = null;
    ffLoudTimer = null;
    if (ffRec && ffRec.state !== 'inactive') { try { ffRec.stop(); } catch (e) {} }
    if (ffStream) { ffStream.getTracks().forEach(t => t.stop()); }
    ffRec = null;
    ffStream = null;
    ffParts = [];
    recentText = [];
  }

  /* --- общее управление --- */
  function start() { if (supported) startSR(); else startFf(); }
  function stop() {
    clearTimeout(disarmTimer);
    armed = false;
    currentWake = '';
    if (rec) { try { rec.abort(); } catch (e) {} rec = null; }
    stopFf();
    updateUI();
  }

  /* пауза wake-прослушивания, пока активен голосовой ввод в чате (избегаем конфликта распознаваний) */
  let chatVoice = false;
  window.__chatVoice = function (active) {
    chatVoice = !!active;
    if (chatVoice) stop();
    else if (enabled) setTimeout(() => { if (!chatVoice && enabled) start(); }, 500);
  };

  if (btn) btn.onclick = () => {
    if (insecure()) { toast('Откройте http://localhost:8080 — для микрофона нужен безопасный контекст', '🎤'); return; }
    enabled = !enabled;
    localStorage.setItem(KEY, enabled ? '1' : '0');
    if (enabled) {
      toast(supported ? 'Скажите: «Саша…»' : 'Серверное распознавание включено: «Саша…»', '🎤 Прослушивание включено');
      setTimeout(start, 100);
    } else {
      stop();
      toast('Прослушивание выключено');
    }
    updateUI();
  };

  updateUI();
  if (enabled) {
    const resume = () => { if (enabled && !chatVoice && !rec && !ffRec) start(); };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume, { passive: true });
    setTimeout(start, 1200);
  }
})();