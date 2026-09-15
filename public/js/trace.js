'use strict';

/* Трекинг голосового/аудио конвейера: запись -> отправка -> распознавание -> ИИ -> озвучка.
   Каждая заметка появляется над строкой ввода с временем и исчезает через несколько секунд.
   Параллельно дублируется в console.log как [voice]. */

(function () {
  const ICONS = { mic: '🎙️', up: '⬆️', stt: '🗣️', ai: '🤖', tts: '🔊', wake: '🎯', sys: 'ℹ️' };
  let box = null;

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  window.TRACE = function (stage, msg, keepMs) {
    try {
      if (!box) box = document.getElementById('ai-trace');
      if (!box) { console.log('[voice]', msg); return; }
      const line = document.createElement('div');
      line.className = 'tr-line tr-' + (ICONS[stage] ? stage : 'sys');
      const t = new Date().toLocaleTimeString('ru-RU', { hour12: false });
      line.innerHTML = '<span class="tr-t">' + t + '</span><span class="tr-e">' + (ICONS[stage] || 'ℹ️') + '</span> <span>' + escapeHtml(msg) + '</span>';
      box.appendChild(line);
      while (box.children.length > 6) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
      const ttl = typeof keepMs === 'number' ? keepMs : 12000;
      setTimeout(() => { if (line.parentNode === box) box.removeChild(line); }, ttl);
      console.log('[voice]', msg);
    } catch (e) { console.log('[voice]', msg); }
  };
})();