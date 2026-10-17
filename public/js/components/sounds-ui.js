(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function optsFrom(list, selected) {
    const blocks = [];
    const builtins = (list || []).filter(s => s.builtin);
    const uploads = (list || []).filter(s => !s.builtin);
    if (builtins.length) {
      blocks.push('<optgroup label="Встроенные">' + builtins.map(s =>
        `<option value="${esc(s.src)}" ${selected === s.src ? 'selected' : ''}>${esc(s.label || s.name)}</option>`).join('') + '</optgroup>');
    }
    if (uploads.length) {
      blocks.push('<optgroup label="Мои звуки">' + uploads.map(s =>
        `<option value="${esc(s.src)}" ${selected === s.src ? 'selected' : ''}>${esc(s.name)}</option>`).join('') + '</optgroup>');
    }
    return blocks.join('');
  }

  async function load(target) {
    const root = target || document.getElementById('w-sounds');
    if (!root) return;
    root.innerHTML = `
      <div class="snd-wrap">
        <div class="snd-block">
          <div class="snd-title">Звук уведомления</div>
          <div class="snd-row">
            <select id="snd-default" class="snd-sel"></select>
            <button class="btn-ghost" id="snd-play-def">▶ Прослушать</button>
          </div>
          <div class="snd-row">
            <span class="snd-lbl">Громкость</span>
            <input type="range" id="snd-vol" min="0" max="1" step="0.1" class="snd-range">
            <span id="snd-volv" class="snd-num">0.6</span>
          </div>
          <div class="snd-row">
            <button class="btn-ghost primary" id="snd-save-def">Сохранить</button>
            <span id="snd-def-note" class="snd-note"></span>
          </div>
        </div>

        <div class="snd-block">
          <div class="snd-title">Свой звук</div>
          <div class="snd-note">Загрузите аудиофайл с компьютера (mp3, wav, ogg, m4a — до 12 МБ).</div>
          <div class="snd-row">
            <input type="file" id="snd-upload" accept="audio/*" class="snd-file">
            <button class="btn-ghost" id="snd-upload-btn">⬆ Загрузить</button>
          </div>
          <div id="snd-upload-note" class="snd-note"></div>
          <div id="snd-mine" class="snd-mine"></div>
        </div>

        <div class="snd-block">
          <div class="snd-title">Правила по приложению/тексту</div>
          <div class="snd-note">Если приложение, заголовок или текст уведомления содержат подстроку — играет выбранный звук. Например: «телеграм», «календарь», «заказ».</div>
          <div id="snd-rules" class="snd-rules"></div>
          <button class="btn-ghost" id="snd-add">+ Добавить правило</button>
        </div>
      </div>
    `;

    const vol = document.getElementById('snd-vol');
    const volv = document.getElementById('snd-volv');
    const defSel = document.getElementById('snd-default');
    const playDef = document.getElementById('snd-play-def');
    const saveDef = document.getElementById('snd-save-def');
    const defNote = document.getElementById('snd-def-note');
    const rulesDiv = document.getElementById('snd-rules');
    const addBtn = document.getElementById('snd-add');
    const uploadInp = document.getElementById('snd-upload');
    const uploadBtn = document.getElementById('snd-upload-btn');
    const uploadNote = document.getElementById('snd-upload-note');
    const mineDiv = document.getElementById('snd-mine');

    const cfgResp = await fetch('/api/sounds/config').then(r => r.json()).catch(() => ({}));
    const cfg = cfgResp.config || { default: { volume: 0.6, src: '/sounds/notify.mp3' }, rules: [] };
    if (!cfg.default) cfg.default = { volume: 0.6, src: '/sounds/notify.mp3' };
    let sounds = (await fetch('/api/sounds/list').then(r => r.json()).catch(() => ({}))).sounds || [];

    vol.value = cfg.default.volume || 0.6;
    volv.textContent = vol.value;
    vol.oninput = () => { volv.textContent = vol.value; };

    function note(el, msg, cls) {
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'snd-note' + (cls ? ' ' + cls : '');
    }

    function renderDefault() {
      defSel.innerHTML = optsFrom(sounds, cfg.default.src);
      if (!defSel.value && sounds.length) { defSel.value = sounds[0].src; }
    }

    function renderMine() {
      const uploads = sounds.filter(s => !s.builtin);
      if (!uploads.length) { mineDiv.innerHTML = '<div class="snd-note">Своих звуков пока нет.</div>'; return; }
      mineDiv.innerHTML = uploads.map(s => `
        <div class="snd-mine-row">
          <button class="btn-ghost" data-play="${esc(s.src)}">▶</button>
          <span class="snd-mine-name">${esc(s.name)}</span>
          <button class="btn-ghost snd-del" data-del="${esc(s.src)}" title="Удалить">✕</button>
        </div>`).join('');
      mineDiv.querySelectorAll('[data-play]').forEach(b => b.onclick = () => playSound(b.dataset.play, parseFloat(vol.value)));
      mineDiv.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        if (!confirm('Удалить звук «' + b.dataset.del.split('/').pop() + '»?')) return;
        const r = await fetch('/api/sounds/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: b.dataset.del }) }).then(x => x.json()).catch(() => ({}));
        if (r.ok) {
          sounds = sounds.filter(s => s.src !== b.dataset.del);
          if (cfg.default.src === b.dataset.del) cfg.default.src = (sounds[0] || {}).src || '/sounds/notify.mp3';
          renderDefault(); renderMine(); renderRules();
          note(uploadNote, 'Удалено.');
        } else { note(uploadNote, 'Ошибка: ' + (r.error || 'не удалось'), 'err'); }
      });
    }

    function renderRules() {
      rulesDiv.innerHTML = (cfg.rules || []).map((r, i) => `
        <div class="snd-rule">
          <input class="snd-pat" placeholder="Паттерн (app / заголовок / текст)" value="${esc(r.pattern || '')}" data-pat="${i}">
          <select class="snd-rule-sel" data-sr="${i}">${optsFrom(sounds, r.src || cfg.default.src)}</select>
          <input type="range" class="snd-rule-vol" min="0" max="1" step="0.1" value="${r.volume != null ? r.volume : (cfg.default.volume || 0.6)}" data-volr="${i}">
          <button class="btn-ghost" data-delr="${i}" title="Удалить правило">×</button>
        </div>`).join('');
      rulesDiv.querySelectorAll('[data-pat]').forEach(inp => inp.onchange = e => { cfg.rules[parseInt(e.target.dataset.pat)].pattern = e.target.value; });
      rulesDiv.querySelectorAll('[data-sr]').forEach(sel => sel.onchange = e => { cfg.rules[parseInt(e.target.dataset.sr)].src = e.target.value; });
      rulesDiv.querySelectorAll('[data-volr]').forEach(inp => inp.oninput = e => { cfg.rules[parseInt(e.target.dataset.volr)].volume = parseFloat(e.target.value); });
      rulesDiv.querySelectorAll('[data-delr]').forEach(btn => btn.onclick = e => { cfg.rules.splice(parseInt(e.target.dataset.delr), 1); renderRules(); });
    }

    function playSound(src, volume) {
      const a = document.getElementById('notif-sound');
      if (!a) return;
      try { a.pause(); } catch (e) {}
      a.src = src;
      a.volume = Math.max(0, Math.min(1, volume != null ? volume : 0.6));
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => note(defNote, 'Не удалось воспроизвести (проверьте громкость/формат).', 'err'));
    }

    renderDefault(); renderMine(); renderRules();

    playDef.onclick = () => playSound(defSel.value, parseFloat(vol.value));

    addBtn.onclick = () => {
      cfg.rules = cfg.rules || [];
      cfg.rules.push({ pattern: '', volume: cfg.default.volume, src: cfg.default.src, enabled: true });
      renderRules();
    };

    saveDef.onclick = async () => {
      cfg.default.volume = parseFloat(vol.value);
      cfg.default.src = defSel.value;
      const r = await fetch('/api/sounds/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default: cfg.default, rules: cfg.rules }) }).then(x => x.json()).catch(() => ({}));
      if (r.ok) note(defNote, 'Сохранено ✔', 'ok');
      else note(defNote, 'Не удалось сохранить', 'err');
    };

    uploadBtn.onclick = async () => {
      const f = uploadInp.files && uploadInp.files[0];
      if (!f) { note(uploadNote, 'Сначала выберите файл.', 'err'); return; }
      if (f.size > 12 * 1024 * 1024) { note(uploadNote, 'Файл больше 12 МБ.', 'err'); return; }
      note(uploadNote, 'Загружаю…');
      try {
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
        const r = await fetch('/api/sounds/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, data }) }).then(x => x.json());
        if (r.ok && r.sound) {
          sounds.push(r.sound);
          renderDefault(); renderMine(); renderRules();
          defSel.value = r.sound.src;
          playSound(r.sound.src, parseFloat(vol.value));
          note(uploadNote, 'Загружено: ' + r.sound.name + ' (выбрано по умолчанию)', 'ok');
          uploadInp.value = '';
        } else {
          note(uploadNote, 'Ошибка: ' + (r.error || 'не удалось загрузить'), 'err');
        }
      } catch (e) {
        note(uploadNote, 'Ошибка загрузки: ' + (e.message || e), 'err');
      }
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const gear = document.getElementById('notif-drawer-sound');
    if (gear) gear.onclick = () => {
      const list = document.getElementById('notif-drawer-list');
      if (list) load(list);
    };
    if (document.getElementById('w-sounds')) load();
  });
  window.SOUNDS_UI = { load };
})();
