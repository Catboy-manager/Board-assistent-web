(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  document.addEventListener('DOMContentLoaded', () => {
    const file = $('cookies-file');
    const analyze = $('cookies-analyze');
    const clear = $('cookies-clear');
    const fromBrowser = $('cookies-from-browser');
    const browserSel = $('cookies-browser');
    const status = $('cookies-status');
    const preview = $('cookies-preview');
    const result = $('cookies-result');
    const progressWrap = $('cookies-progress-wrap');
    const progressFill = $('cookies-progress-fill');
    const progressLabel = $('cookies-progress-label');
    const logEl = $('cookies-log');
    const tagsEl = $('cookies-tags');
    const portraitEl = $('cookies-portrait');
    let text = '';
    let pollTimer = null;
    let pollSince = 0;
    let pollTicks = 0;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function setProgress(pct, label) {
      if (progressWrap) progressWrap.hidden = false;
      if (typeof pct === 'number' && progressFill) progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (label != null && progressLabel) progressLabel.textContent = label;
    }

    function log(line, cls) {
      if (!logEl) return;
      logEl.hidden = false;
      const row = document.createElement('div');
      row.className = 'cookies-log-row' + (cls ? ' ' + cls : '');
      row.textContent = line;
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
    }

    function addTag(ev) {
      if (!tagsEl) return;
      const chip = document.createElement('span');
      chip.className = 'cookies-tag';
      chip.innerHTML = '<b>' + esc(ev.icon || '🏷') + ' ' + esc(ev.label || '') + '</b> #' + esc(ev.tag || '');
      tagsEl.appendChild(chip);
    }

    function resetUi() {
      if (logEl) { logEl.innerHTML = ''; logEl.hidden = true; }
      if (tagsEl) tagsEl.innerHTML = '';
      if (portraitEl) { portraitEl.hidden = true; portraitEl.innerHTML = ''; }
      if (progressFill) progressFill.style.width = '0%';
      if (progressWrap) progressWrap.hidden = false;
    }

    function renderPortrait(p) {
      if (!portraitEl || !p) return;
      const traits = (p.traits || []).map(t =>
        '<div class="portrait-trait"><span class="portrait-trait-ic">' + esc(t.icon) + '</span>' +
        '<span class="portrait-trait-name">' + esc(t.label) + '</span>' +
        '<span class="portrait-trait-w">' + (t.count || 0) + '</span></div>').join('');
      portraitEl.innerHTML =
        '<div class="portrait-head"><span class="portrait-ic">' + esc(p.icon || '🧑') + '</span>' +
        '<div><div class="portrait-title">' + esc(p.title || 'Портрет') + '</div>' +
        '<div class="portrait-sub">' + ((p.traits || []).length) + ' темы · ' + ((p.keywords || []).length) + ' ключевых слов</div></div></div>' +
        '<div class="portrait-summary">' + esc(p.summary || '') + '</div>' +
        (traits ? '<div class="portrait-traits">' + traits + '</div>' : '');
      portraitEl.hidden = false;
    }

    function renderInterests(d) {
      if (!result) return;
      const cats = (d.cats || []).filter(c => c.count > 0);
      const themes = (d.themes || []).filter(t => t.count > 0);
      const all = cats.concat(themes);
      if (!all.length) { result.innerHTML = '<div class="hint">Сигналов не найдено — попробуйте другой браузер или загрузите cookies.txt.</div>'; return; }
      const rows = all.map(c =>
        '<div style="display:flex;align-items:center;gap:8px"><span>' + esc(c.icon) + '</span>' +
        '<b style="min-width:150px">' + esc(c.label) + (c.auto ? ' <span class="hint">(авто)</span>' : '') + '</b>' +
        '<span style="background:var(--panel-2);border-radius:6px;height:8px;flex:1"><span style="display:block;height:8px;border-radius:6px;background:linear-gradient(90deg,#ff6fb5,#a879ff);width:' + (c.weight || 0) + '%"></span></span>' +
        '<span class="hint" style="min-width:24px">' + (c.count || 0) + '</span></div>').join('');
      result.innerHTML = '<div class="hint">Карта интересов (' + all.length + ' тем' + (themes.length ? ', из них авто: ' + themes.length : '') + '):</div>' + rows;
    }

    async function reloadInterests() {
      try {
        const r = await fetch('/api/yt/interests');
        if (r.ok) {
          const d = await r.json();
          renderInterests(d);
          if (d.portrait) renderPortrait(d.portrait);
        }
      } catch (e) {}
    }

    function stopStream() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    }

    function handleEvent(ev) {
      switch (ev.stage) {
        case 'start':
        case 'file':
        case 'scan':
        case 'read':
        case 'parse':
          setProgress(ev.pct, ev.message);
          log(ev.message);
          break;
        case 'tags':
          setProgress(ev.pct, ev.message);
          log(ev.message);
          if (tagsEl) tagsEl.innerHTML = '';
          break;
        case 'tag':
          setProgress(ev.pct, ev.message);
          addTag(ev);
          log(ev.message, 'tag');
          break;
        case 'apply':
          setProgress(ev.pct, ev.message);
          log(ev.message);
          break;
        case 'verify':
          setProgress(ev.pct, ev.message);
          log('✔ ' + ev.message, 'ok');
          break;
        case 'themes':
          setProgress(ev.pct, ev.message);
          log(ev.message);
          break;
        case 'portrait':
          setProgress(ev.pct, ev.message);
          if (ev.portrait) renderPortrait(ev.portrait);
          break;
        case 'done':
          setProgress(100, 'Готово');
          if (ev.result) {
            const v = ev.result.verify || {};
            status.textContent = 'Готово: записей ' + (ev.result.count || 0) + ', сигналов ' + (ev.result.updates || 0) + (v.imported ? ' · ' + v.message : '');
            if (ev.result.portrait) renderPortrait(ev.result.portrait);
          } else {
            status.textContent = 'Готово';
          }
          log('✔ ' + (ev.message || 'Готово'), 'ok');
          stopStream();
          reloadInterests();
          if (window.INT && window.INT.load) window.INT.load();
          break;
        case 'error':
          setProgress(100, ev.message);
          status.textContent = 'Ошибка: ' + (ev.message || '');
          log('✖ ' + (ev.message || 'Ошибка'), 'err');
          stopStream();
          break;
        default:
          if (ev.message) { setProgress(ev.pct, ev.message); log(ev.message); }
      }
    }

    async function fallbackRebuild(payload) {
      stopStream();
      setProgress(100, 'Завершаю…');
      try {
        const body = (payload && typeof payload.text === 'string') ? payload.text : '';
        const r = await fetch('/api/interests/rebuild-from-cookies', {
          method: 'POST', headers: { 'Content-Type': 'text/plain' }, body
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          status.textContent = 'Готово: доменов ' + (d.domains || 0) + ', сигналов ' + (d.updates || 0);
          if (d.portrait) renderPortrait(d.portrait);
        } else {
          status.textContent = 'Ошибка: ' + (d.error || r.status);
        }
      } catch (e) {
        status.textContent = 'Сервер обновляет карту — результат обновится позже.';
      }
      await reloadInterests();
      if (window.INT && window.INT.load) window.INT.load();
    }

    async function startImport(payload) {
      resetUi();
      status.textContent = 'Импортирую…';
      stopStream();
      let jobId = '';
      try {
        const r = await fetch('/api/interests/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.job) { status.textContent = 'Не удалось запустить импорт: ' + (d.error || r.status); return; }
        jobId = d.job;
      } catch (e) {
        status.textContent = 'Сервер недоступен: ' + String(e.message || e);
        return;
      }
      pollSince = 0;
      pollTicks = 0;
      log('Отслеживаю прогресс импорта…');
      pollStep(jobId);
    }

    async function pollStep(jobId) {
      let d = null;
      try {
        const r = await fetch('/api/interests/import/status?job=' + encodeURIComponent(jobId) + '&since=' + pollSince);
        d = await r.json();
      } catch (e) {
        d = null;
      }
      if (d && Array.isArray(d.events)) {
        for (const ev of d.events) { try { handleEvent(ev); } catch (e) {} }
        pollSince = (typeof d.next === 'number') ? d.next : pollSince + d.events.length;
      }
      if (d && d.done) { stopStream(); return; }
      if (d && d.ok === false) {
        stopStream();
        log('Задача импорта не найдена — обновляю напрямую…', 'err');
        fallbackRebuild({});
        return;
      }
      pollTicks++;
      if (pollTicks < 600) {
        pollTimer = setTimeout(() => pollStep(jobId), 500);
      } else {
        stopStream();
        status.textContent = 'Импорт идёт дольше обычного — результат обновится позже.';
        reloadInterests();
        if (window.INT && window.INT.load) window.INT.load();
      }
    }

    if (fromBrowser) fromBrowser.addEventListener('click', () => {
      const b = browserSel ? browserSel.value : '';
      startImport({ browser: b });
    });

    if (file) file.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      text = await f.text();
      if (preview) {
        preview.style.display = '';
        preview.textContent = text.length > 8000 ? text.slice(0, 8000) + '\n... (обрезано для предпросмотра)' : text;
      }
      status.textContent = 'Файл загружен: ' + f.name + ' (' + Math.round(text.length / 1024) + ' КБ). Нажмите «Проанализировать».';
    });

    if (clear) clear.addEventListener('click', () => {
      text = '';
      stopStream();
      if (file) file.value = '';
      if (preview) { preview.textContent = ''; preview.style.display = 'none'; }
      if (result) result.innerHTML = '';
      if (logEl) { logEl.innerHTML = ''; logEl.hidden = true; }
      if (tagsEl) tagsEl.innerHTML = '';
      if (portraitEl) { portraitEl.hidden = true; portraitEl.innerHTML = ''; }
      if (progressWrap) progressWrap.hidden = true;
      status.textContent = '';
    });

    if (analyze) analyze.addEventListener('click', () => {
      if (text.trim()) startImport({ text });
      else startImport({});
    });

    reloadInterests();
  });
})();
