'use strict';

(function () {
  let history = [];
  let initDone = false;
  let attached = null;
  let mediaRec = null;
  let recStart = 0;
  let srRetries = 0;
  const $ = id => document.getElementById(id);
  const trace = (s, m) => window.TRACE && window.TRACE(s, m);
  const setChatVoice = (active) => { try { if (window.__chatVoice) window.__chatVoice(active); } catch (e) {} };

  window.AI_INIT = function () {
    if (initDone) return;
    initDone = true;
    attachEvents();
    fetchModelTag();
    addMsg('bot', 'Привет! Я ассистент Big Pickle. Спрашивай, прикрепляй фото 🖼️ или используй голос 🎙️.');

    if (history.length === 0) {
      const go = function () { history.push({ role: 'user', content: 'Напомни, какова текущая задача пользователя на доске? Коротко.' }); fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) }).then(r => r.json()).then(d => { if (d.reply) addMsg('bot', d.reply); }).catch(() => {}); };
      setTimeout(go, 600);
    }
  };

  function attachEvents() {
    $('btn-ai-send').onclick = () => sendText();
    $('ai-text').addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
    $('btn-ai-photo').onclick = () => $('ai-photo-input').click();
    $('ai-photo-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await readFile(file);
      attached = { dataUrl, name: file.name };
      showPreview();
      e.target.value = '';
    };
    $('btn-ai-mic').onclick = toggleVoice;
  }

  async function fetchModelTag() {
    try {
      const r = await fetch('/api/config');
      const c = await r.json();
      const m = (c.ai && c.ai.model) || 'opencode/big-pickle';
      $('ai-model-tag').textContent = m;
    } catch (e) {}
  }

  function addMsg(role, text, extra = {}) {
    const box = $('ai-messages');
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'bot') + (extra.error ? ' error' : '');
    let html = '<div>' + esc(text) + '</div>';
    if (extra.media) html += `<img class="msg-attach-media" src="${extra.media}" alt="вложение">`;
    if (extra.wavNote) html += `<div class="msg-meta">🎙️ голосовой ввод</div>`;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

function typing() {
    removeTyping();
    const box = $('ai-messages');
    const div = document.createElement('div');
    div.id = 'typing-dot';
    div.innerHTML = '<div class="typing"><i></i><i></i><i></i></div><span class="typing-timer"> ⏳ 0с</span>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    const t0 = Date.now();
    window.__kbdTypingTimer = setInterval(() => {
      const el = $('typing-dot');
      if (!el) { clearInterval(window.__kbdTypingTimer); return; }
      const tm = el.querySelector('.typing-timer');
      if (tm) tm.textContent = ' ⏳ ' + Math.round((Date.now() - t0) / 1000) + 'с';
    }, 1000);
  }
  function removeTyping() {
    const t = $('typing-dot'); if (t) t.remove();
    clearInterval(window.__kbdTypingTimer);
    window.__kbdTypingTimer = null;
  }

  async function sendText(textVal, viaVoice) {
    const inp = $('ai-text');
    const text = (typeof textVal === 'string' ? textVal : inp.value).trim();
    if (!text && !attached) return;
    if (typeof textVal !== 'string') inp.value = '';

    if (window.ASSIST && text && !viaVoice) {
      try {
        const handled = await window.ASSIST.tryLocal(text, addMsg);
        if (handled) { attached = null; hidePreview(); return; }
      } catch (e) {}
    }

    const content = [];
    if (attached) content.push({ type: 'image_url', image_url: { url: attached.dataUrl } });
    if (text) content.push({ type: 'text', text });

    addMsg('user', text || '📷', { media: attached ? attached.dataUrl : null });
    attached = null;
    hidePreview();

    history.push({ role: 'user', content });
    streamReply(!!viaVoice);
  }

  function speakViaTts(text) {
    try {
      if (window.ASSIST) { window.ASSIST.speak(text); return; }
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      u.rate = 1.05;
      u.onerror = () => {};
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function shouldSpeak(viaVoice) {
    if (viaVoice) return true;
    try { return !!(window.ASSIST && window.ASSIST.voiceEnabled()); } catch (e) { return false; }
  }

  window.AI = window.AI || {};
  window.AI.init = window.AI_INIT;
  window.AI.run = function (text, viaVoice) { sendText(text, viaVoice); };
  window.AI.speak = speakViaTts;

  async function streamReply(viaVoice) {
    typing();
    trace('ai', 'ИИ обрабатывает запрос…');
    const botEl = $('ai-messages').appendChild(document.createElement('div'));
    botEl.className = 'msg bot';
    const bodyEl = document.createElement('div');
    botEl.appendChild(bodyEl);
    let acc = '';
    let files = null;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, stream: true })
      });
      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('text/event-stream')) {
        const d = await res.json().catch(() => ({}));
        removeTyping();
        if (d.error) throw new Error(d.error);
        if (d.reply) { acc = d.reply; }
        if (d.files) files = d.files;
        history.push({ role: 'assistant', content: acc });
        finishBot(botEl, bodyEl, acc);
        renderFiles(botEl, files);
        if (shouldSpeak(viaVoice)) { trace('tts', 'Озвучка ответа…'); speakViaTts(acc); }
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          let ev = null;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.error) throw new Error(ev.error);
          if (ev.delta) { acc += ev.delta; bodyEl.textContent = acc; }
          if (ev.files) files = ev.files;
        }
        bodyEl.textContent = acc;
        const box = $('ai-messages');
        box.scrollTop = box.scrollHeight;
      }
      removeTyping();
      if (!acc.trim()) acc = '⚠️ Модель вернула пустой ответ.';
      history.push({ role: 'assistant', content: acc });
      finishBot(botEl, bodyEl, acc);
      renderFiles(botEl, files);
      if (shouldSpeak(viaVoice)) { trace('tts', 'Озвучка ответа…'); speakViaTts(acc); }
    } catch (e) {
      removeTyping();
      history.pop();
      if (!bodyEl.textContent) bodyEl.textContent = '';
      botEl.classList.add('error');
      bodyEl.textContent = '⚠️ ' + e.message;
    }
  }

  function finishBot(botEl, bodyEl, text) {
    bodyEl.textContent = text;
    const box = $('ai-messages');
    box.scrollTop = box.scrollHeight;
  }

  function renderFiles(container, files) {
    if (!files || !files.length) return;
    const box = document.createElement('div');
    box.className = 'msg-files';
    box.innerHTML = '<div class="msg-files-title">📁 Создано / изменено:</div>' +
      files.map(f => `<a class="file-link" href="/api/file?path=${encodeURIComponent(f.path)}" download>⬇ ${esc(f.path)}</a>`).join('');
    container.appendChild(box);
    const boxMsg = $('ai-messages');
    boxMsg.scrollTop = boxMsg.scrollHeight;
  }

  function readFile(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }

  function showPreview() {
    const p = $('ai-preview');
    p.classList.remove('hidden');
    p.innerHTML = `<img src="${attached.dataUrl}" alt="фото"><span style="font-size:12px;color:#9aa7b8;flex:1">${esc(attached.name)}</span><button class="icon-btn" id="ai-remove-photo" style="min-width:28px;height:28px;font-size:13px">✕</button>`;
    $('ai-remove-photo').onclick = () => { attached = null; hidePreview(); };
  }
  function hidePreview() { $('ai-preview').classList.add('hidden'); $('ai-preview').innerHTML = ''; }

  const sr = (window.SpeechRecognition || window.webkitSpeechRecognition);
  const srBroken = () => window.__srBroken === true;

  function toggleVoice() {
    if (mediaRec && mediaRec.state === 'recording') { stopRecord(); return; }
    setChatVoice(true);
    if (sr && !srBroken()) startSR();
    else startRecord();
  }

  function endChatVoice() {
    stopVoiceUI();
    setChatVoice(false);
  }

  function startSR() {
    const rec = new sr();
    rec.lang = 'ru-RU';
    trace('mic', 'Запуск распознавания речи (браузер)…');
    $('ai-voice-status').classList.remove('hidden');
    $('ai-voice-status').textContent = '🎙️ Слушаю…';
    $('btn-ai-mic').classList.add('active');
    rec.onresult = (e) => {
      srRetries = 0;
      endChatVoice();
      const t = e.results[0][0].transcript;
      trace('stt', 'Распознано: «' + t + '»');
      $('ai-text').value = t;
      sendText();
    };
    rec.onerror = (e) => {
      console.error('[voice] SpeechRecognition error:', e);
      trace('mic', 'Ошибка распознавания: ' + (e && e.error));
      if (e && e.error === 'not-allowed') {
        endChatVoice();
        addMsg('bot', '⚠️ Нет доступа к микрофону: проверьте разрешение в браузере.', { error: true });
        return;
      }
      if (e && (e.error === 'network' || e.error === 'service-not-allowed')) {
        window.__srBroken = true;
        try { localStorage.setItem('srBroken', '1'); } catch (err) {}
        srRetries = 0;
        stopVoiceUI();
        trace('mic', 'Браузерное распознавание недоступно в этой сети — переключаюсь на сервер (просто нажмите 🎙️ ещё раз для отправки)');
        startRecord();
        return;
      }
      if (e && e.error === 'aborted' && srRetries < 2) {
        srRetries++;
        trace('mic', 'Распознавание прервалось — пробую ещё раз…');
        setTimeout(startSR, 400);
        return;
      }
      srRetries = 0;
      stopVoiceUI();
      trace('mic', 'Переключаюсь на запись через сервер — нажмите 🎙️ ещё раз для отправки');
      startRecord();
    };
    rec.onend = () => { if (srRetries === 0) endChatVoice(); };
    rec.start();
  }

  function stopVoiceUI() {
    $('ai-voice-status').classList.add('hidden');
    $('btn-ai-mic').classList.remove('active');
  }

  function startRecord() {
    if (typeof window.isSecureContext !== 'undefined' && !window.isSecureContext) {
      addMsg('bot', '⚠️ Микрофон недоступен: страница открыта не как безопасный контекст. Откройте http://localhost:8080 (на ПК) или https://<IP>:8443 с установленным сертификатом.', { error: true });
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { addMsg('bot', '⚠️ Запись не поддерживается в этом браузере.', { error: true }); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      trace('mic', '✅ Доступ к микрофону получен');
      const rec = new MediaRecorder(stream);
      const mime = rec.mimeType || 'audio/webm';
      mediaRec = rec;
      const chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = async () => {
        stopSilenceMeter();
        endChatVoice();
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mime });
        const dur = recStart ? ((Date.now() - recStart) / 1000).toFixed(1) : '?';
        recStart = 0;
        chunks.length = 0;
        trace('mic', '⏹ Запись остановлена: ' + dur + ' с, ' + (blob.size / 1024).toFixed(1) + ' КБ');
        trace('up', 'Отправка аудио на сервер…');
        const dataUrl = await reader(blob);
        const format = (mime.split(';')[0].split('/')[1] || 'webm');
        addMsg('user', '🎙️ голосовое сообщение');
        typing();
        try {
          const r = await fetch('/api/ai/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: dataUrl, format, mime }) });
          const d = await r.json();
          removeTyping();
          if (d.error) { trace('sys', 'Ошибка сервера: ' + d.error); addMsg('bot', '⚠️ ' + d.error, { error: true }); return; }
          const tm = d.timings || {};
          if (d.transcript) {
            trace('stt', '🗣 Распознано: «' + d.transcript + '» (stt ' + (tm.sttMs != null ? tm.sttMs : '?') + ' мс)');
            history.push({ role: 'user', content: d.transcript });
            const last = $('ai-messages').lastChild;
            if (last && last.classList.contains('user')) last.lastChild.textContent = '🎙️ ' + d.transcript;
          } else {
            trace('stt', 'Распознавание пусто — аудио отправлено модели напрямую (' + (tm.sttMs != null ? tm.sttMs : '?') + ' мс)');
          }
          trace('ai', 'Ответ ИИ за ' + (tm.aiMs != null ? tm.aiMs : '?') + ' мс');
          addMsg('bot', d.reply);
          const lastMsg = $('ai-messages').lastChild;
          if (lastMsg) renderFiles(lastMsg, d.files);
        } catch (e) { removeTyping(); trace('sys', 'Сетевая ошибка: ' + e.message); addMsg('bot', '⚠️ Сетевая ошибка.', { error: true }); }
      };
      rec.start();
      recStart = Date.now();
      $('ai-voice-status').classList.remove('hidden');
      $('ai-voice-status').textContent = '🎙️ Говорите… (пауза — отправка автоматически)';
      $('btn-ai-mic').classList.add('active');
      startSilenceMeter(stream);
    }).catch(err => { trace('mic', 'Нет доступа к микрофону: ' + (err && err.name)); endChatVoice(); addMsg('bot', '⚠️ Нет доступа к микрофону.', { error: true }); });
  }

  function stopRecord() {
    if (mediaRec && mediaRec.state === 'recording') mediaRec.stop();
    mediaRec = null;
  }

  let silenceTimer = null;
  function startSilenceMeter(stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const actx = window.__kvActx || (window.__kvActx = new Ctx());
      if (actx.state === 'suspended') actx.resume();
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const t0 = Date.now();
      let silentMs = 0;
      silenceTimer = setInterval(() => {
        if (!mediaRec || mediaRec.state !== 'recording') return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 8) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / (buf.length / 8));
        silentMs = (rms < 0.015) ? (silentMs + 120) : 0;
        const elapsed = Date.now() - t0;
        if ((elapsed > 1500 && silentMs >= 900) || elapsed > 45000) stopRecord();
      }, 120);
    } catch (e) { console.warn('silence meter:', e); }
  }
  function stopSilenceMeter() {
    clearInterval(silenceTimer);
    silenceTimer = null;
  }

  function reader(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }

  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
})();