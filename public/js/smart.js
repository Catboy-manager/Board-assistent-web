'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const KEY_STORE = 'kban-smart-key';

  let data = null;
  let es = null;
  let tab = 'dev';
  let editId = null;
  let prefill = null;
  let refreshTimer = null;
  let yaTimer = null;
  let yaSeq = 0;

  function key() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }

  async function api(method, p, body) {
    const headers = {};
    const k = key();
    if (k) headers['x-smart-key'] = k;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let d = null;
    try { d = await r.json(); } catch (e) {}
    if (r.status === 401 || r.status === 403) {
      const row = $('sm-keyrow');
      if (row) row.classList.remove('hidden');
      if (d && d.error) toast('Умный дом', d.error, true);
      return { status: r.status, d };
    }
    return { status: r.status, d };
  }

  function toast(title, msg, warn) {
    try { if (window.APP && window.APP.toast) window.APP.toast(title, msg, warn); } catch (e) {}
  }

  function stateText(d) {
    const s = d.state || {};
    if (typeof s.on === 'boolean') {
      const extra = [];
      if (typeof s.brightness === 'number') extra.push(s.brightness + '%');
      if (typeof s.temperature === 'number') extra.push(s.temperature + '°');
      if (typeof s.power === 'number') extra.push(s.power + ' Вт');
      return (s.on ? 'вкл' : 'выкл') + (extra.length ? ' · ' + extra.join(' · ') : '');
    }
    const keys = Object.keys(s);
    if (!keys.length) return 'нет состояния';
    return keys.slice(0, 4).map(k => k + '=' + s[k]).join(', ');
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function kindIcon(k) {
    return ({ station: '🗣', lamp: '💡', plug: '🔌', kettle: '🫖', relay: '⚡', sensor: '📶', media: '📺' })[k] || '🏠';
  }

  const SHELL = `
    <div class="sm-bar">
      <button class="btn mini" id="sm-scan" title="Опросить локальную сеть на предмет устройств">🔍 Скан LAN</button>
      <label class="sm-check" title="Автоматически опрашивать устройства"><input type="checkbox" id="sm-poll"> опрос</label>
      <select id="sm-int" class="sm-sel" title="Интервал опроса">
        <option value="5000">5 с</option><option value="15000">15 с</option><option value="30000">30 с</option><option value="60000">60 с</option>
      </select>
      <button class="btn mini link" id="sm-add" title="Добавить устройство вручную">＋</button>
      <span class="sm-st" id="sm-st"></span>
    </div>
    <div class="sm-keyrow hidden" id="sm-keyrow">
      <input type="password" id="sm-keyin" placeholder="KANBAN_SMART_KEY" class="sm-kin">
      <button class="btn mini" id="sm-keyok">OK</button>
    </div>
    <div class="sm-ya" id="sm-ya"></div>
    <div class="sm-tabs">
      <button class="sm-tab active" data-t="dev">Устройства</button>
      <button class="sm-tab" data-t="host">Сеть</button>
      <button class="sm-tab" data-t="scene">Сценарии</button>
      <button class="sm-tab" data-t="log">События</button>
    </div>
    <div class="sm-pane active" id="sm-dev"></div>
    <div class="sm-pane" id="sm-host"></div>
    <div class="sm-pane" id="sm-scene"></div>
    <div class="sm-pane" id="sm-log"></div>`;

  async function load() {
    const box = $('sp-smart');
    if (!box) return;
    if (!box.dataset.init) {
      box.dataset.init = '1';
      box.innerHTML = SHELL;
      wire();
      openEvents();
    }
    await refresh();
  }

  function wire() {
    $('sm-scan').onclick = async () => {
      const r = await api('POST', '/api/smart/scan', {});
      if (r.status === 202) { setStatus('сканирую…'); toast('Умный дом', 'Скан локальной сети запущен'); }
      else if (r.d && r.d.error) toast('Умный дом', r.d.error, true);
    };
    $('sm-poll').onchange = () => savePoll();
    $('sm-int').onchange = () => savePoll();
    $('sm-add').onclick = () => openForm(null, null);
    $('sm-keyok').onclick = () => {
      const v = $('sm-keyin').value.trim();
      try { if (v) localStorage.setItem(KEY_STORE, v); } catch (e) {}
      $('sm-keyrow').classList.add('hidden');
      refresh();
    };
    document.querySelectorAll('#sp-smart .sm-tab').forEach(b => {
      b.onclick = () => {
        tab = b.getAttribute('data-t');
        document.querySelectorAll('#sp-smart .sm-tab').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('#sp-smart .sm-pane').forEach(p => p.classList.toggle('active', p.id === 'sm-' + tab));
        render();
      };
    });
  }

  async function savePoll() {
    const enabled = $('sm-poll').checked;
    const interval = Number($('sm-int').value);
    const r = await api('POST', '/api/smart/poll', { enabled, interval });
    if (r.status !== 200 && r.d && r.d.error) toast('Умный дом', r.d.error, true);
  }

  function setStatus(t) { const el = $('sm-st'); if (el) el.textContent = t || ''; }

  async function refresh() {
    const r = await api('GET', '/api/smart');
    if (r.status !== 200 || !r.d) return;
    data = r.d;
    const pollBox = $('sm-poll'), intBox = $('sm-int');
    if (pollBox) pollBox.checked = !!data.poll.enabled;
    if (intBox) intBox.value = String(data.poll.interval);
    if (data.scanning) setStatus('сканирую…');
    else if (data.scanAt) setStatus('сеть: ' + new Date(data.scanAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    renderYa();
    render();
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 700);
  }

  /* ---------------- отрисовка ---------------- */

  function render() {
    if (!data) return;
    if (tab === 'dev') renderDev();
    if (tab === 'host') renderHost();
    if (tab === 'scene') renderScene();
    if (tab === 'log') renderLog();
  }

  function devOptions(sel, filter) {
    const list = (data.devices || []).filter(filter || (() => true));
    if (!list.length) return '<option value="">— устройств нет —</option>';
    return list.map(d => `<option value="${d.id}"${d.id === sel ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  }

  function kindBtns(d) {
    const stub = d.stub ? ` disabled title="${esc(d.stub)}"` : '';
    const k = d.kind || 'other';
    const p = ['on', 'off'].map(a => `<button class="btn mini" data-cmd="${a}"${stub}>${a === 'on' ? 'Вкл' : 'Выкл'}</button>`).join('');
    const tog = `<button class="btn mini" data-cmd="toggle"${stub}>⇄</button>`;
    const parts = [];
    if (k === 'kettle') {
      parts.push(`<button class="btn mini" data-cmd="on"${stub}>☕ Вскипятить</button>`);
      parts.push(`<button class="btn mini" data-cmd="off"${stub}>Выключить</button>`);
      parts.push(tog);
    } else if (k === 'sensor') {
      parts.push(`<button class="btn mini" data-cmd="state" data-val="{}"${stub}>🔁 Опросить</button>`);
    } else {
      parts.push(p, tog);
    }
    if (k === 'lamp' && d.adapter === 'glagol') {
      parts.push(`<button class="btn mini" data-cmd="brightness" data-val="+10"${stub} title="Ярче">▲</button>`);
      parts.push(`<button class="btn mini" data-cmd="brightness" data-val="-10"${stub} title="Тусклее">▼</button>`);
    }
    if (k === 'station' && d.adapter === 'glagol') {
      parts.push(`<button class="btn mini" data-cmd="say" data-say="1"${stub}>🎙 Скажи</button>`);
      parts.push(`<button class="btn mini" data-cmd="volume" data-val="+10"${stub} title="Громче">🔊+</button>`);
      parts.push(`<button class="btn mini" data-cmd="volume" data-val="-10"${stub} title="Тише">🔊−</button>`);
    }
    return parts.join('');
  }

  function renderDev() {
    const box = $('sm-dev');
    if (!box) return;
    const devs = data.devices || [];
    let html = '';
    if (editId !== undefined && (editId !== null || prefill)) html += deviceForm();
    if (!devs.length && editId === null && !prefill) {
      box.innerHTML = `<div class="empty-state">Устройств пока нет
        <div class="sm-hintbtns">
          <button class="btn mini" id="sm-empty-scan">🔍 Сканировать LAN</button>
          <button class="btn mini" id="sm-empty-add">＋ Добавить вручную</button>
        </div>
        <div class="sm-hint">Сканер ищет в сети станцию Алисы (порт 1337), устройства Tuya (6666/6668), MQTT (1883) и HTTP-устройства.</div></div>` + html;
      const b1 = $('sm-empty-scan'), b2 = $('sm-empty-add');
      if (b1) b1.onclick = () => $('sm-scan').click();
      if (b2) b2.onclick = () => openForm(null, null);
      return;
    }
    html += devs.map(d => {
      const on = typeof (d.state || {}).on === 'boolean' ? d.state.on : null;
      return `<div class="sm-card${on === true ? ' on' : ''}${d.online === false ? ' off' : ''}" data-id="${d.id}">
        <div class="sm-ic">${kindIcon(d.kind)}</div>
        <div class="sm-main">
          <div class="sm-name">${esc(d.name)}
            <span class="sm-badge${d.stub ? ' soon' : ''}">${esc(d.adapter)}</span>
            ${d.ip ? `<span class="sm-ip">${esc(d.ip)}</span>` : ''}
          </div>
          <div class="sm-sub">${esc(stateText(d))}${d.stateAt ? ' · ' + fmtTime(d.stateAt) : ''}${d.online === false ? ' · 🔴 офлайн' : ''}${d.notes ? ' · ' + esc(d.notes) : ''}</div>
          <div class="sm-acts">
            ${kindBtns(d)}
            <button class="btn mini link" data-act="edit" title="Изменить">✎</button>
            <button class="btn mini link" data-act="del" title="Удалить">🗑</button>
          </div>
        </div>
        <span class="sm-dot" title="${d.online === false ? 'офлайн' : 'на связи'}"></span>
      </div>`;
    }).join('');
    box.innerHTML = html;
    box.querySelectorAll('.sm-card').forEach(card => {
      const id = card.getAttribute('data-id');
      card.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => {
        if (b.getAttribute('data-say') === '1') { toggleSay(card, id); return; }
        let val;
        const rv = b.getAttribute('data-val');
        if (rv !== null && rv !== '') { try { val = JSON.parse(rv); } catch (e) { val = rv; } }
        cmd(id, b.getAttribute('data-cmd'), val);
      });
      card.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const act = b.getAttribute('data-act');
        if (act === 'edit') openForm(id, null);
        if (act === 'del') {
          if (b.dataset.arm !== '1') {
            b.dataset.arm = '1'; b.textContent = 'Точно?'; b.classList.add('danger');
            setTimeout(() => { b.dataset.arm = ''; b.textContent = '🗑'; b.classList.remove('danger'); }, 4000);
            return;
          }
          const r = await api('POST', '/api/smart/device/' + id + '/delete', {});
          if (r.status === 200) refresh(); else toast('Умный дом', (r.d && r.d.error) || 'ошибка', true);
        }
      });
    });
    const f = $('sm-form');
    if (f) wireDeviceForm();
  }

  function deviceForm() {
    const d = editId ? (data.devices || []).find(x => x.id === editId) : null;
    const p = prefill || {};
    const v = (k, alt) => esc(d ? (d[k] != null ? d[k] : '') : (p[k] != null ? p[k] : (alt != null ? alt : '')));
    const meta = (d && d.meta) || p.meta || {};
    const adapter = d ? d.adapter : (p.adapter || 'manual');
    return `<div class="sm-form" id="sm-form">
      <div class="sm-ftitle">${d ? '✎ Изменить устройство' : '＋ Новое устройство'}</div>
      <input class="sm-in" id="f-name" placeholder="Название (например, Лампа)" value="${v('name')}">
      <div class="sm-ftitle sm-sub2">Это устройство…</div>
      <div class="sm-kindrow" id="f-kindrow">
        ${(data.kinds || []).map(k => `<button type="button" class="sm-kind-btn${((d ? d.kind : p.kind) || 'other') === k[0] ? ' active' : ''}" data-kind="${k[0]}" title="${esc(k[1])}">${kindIcon(k[0])}<span>${esc(k[1])}</span></button>`).join('')}
      </div>
      <input type="hidden" id="f-kind" value="${esc((d ? d.kind : p.kind) || 'other')}">
      <div class="sm-frow">
        <select class="sm-in" id="f-adapter">${(data.adapters || []).map(a => `<option value="${a.id}"${adapter === a.id ? ' selected' : ''}>${esc(a.label)}${a.soon ? ' (' + a.soon + ')' : ''}</option>`).join('')}</select>
      </div>
      <div class="sm-frow">
        <input class="sm-in" id="f-ip" placeholder="IP (для скана/онлайна)" value="${v('ip')}">
        <input class="sm-in" id="f-port" placeholder="порт" value="${v('port')}">
      </div>
      <input class="sm-in" id="f-cmd" placeholder="cmdUrl — POST для команд (HTTP-мост/вебхук)" value="${esc(meta.cmdUrl || '')}">
      <input class="sm-in" id="f-poll" placeholder="pollUrl — GET для опроса состояния (HTTP-мост)" value="${esc(meta.pollUrl || '')}">
      <input class="sm-in" id="f-notes" placeholder="Заметка" value="${v('notes')}">
      <div class="sm-frow">
        <button class="btn mini" id="f-save">Сохранить</button>
        <button class="btn mini link" id="f-cancel">Отмена</button>
      </div>
    </div>`;
  }

  function wireDeviceForm() {
    $('f-cancel').onclick = () => { editId = null; prefill = null; render(); };
    const kindRow = $('f-kindrow');
    if (kindRow) {
      const syncKind = () => {
        const cur = $('f-kind').value;
        kindRow.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('active', x.getAttribute('data-kind') === cur));
      };
      kindRow.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
        $('f-kind').value = b.getAttribute('data-kind');
        syncKind();
      });
    }
    $('f-save').onclick = async () => {
      const pmeta = (prefill && prefill.meta && typeof prefill.meta === 'object') ? prefill.meta : {};
      const body = {
        id: editId || undefined,
        name: $('f-name').value.trim(),
        kind: $('f-kind').value,
        adapter: $('f-adapter').value,
        ip: $('f-ip').value.trim(),
        port: $('f-port').value.trim(),
        notes: $('f-notes').value.trim(),
        meta: Object.assign({}, pmeta, { cmdUrl: $('f-cmd').value.trim(), pollUrl: $('f-poll').value.trim() })
      };
      if (!body.name) { toast('Умный дом', 'Укажите название устройства', true); return; }
      const r = await api('POST', '/api/smart/device', body);
      if (r.status === 200) { editId = null; prefill = null; toast('Умный дом', 'Устройство сохранено'); refresh(); }
      else toast('Умный дом', (r.d && r.d.error) || 'ошибка сохранения', true);
    };
  }

  function openForm(id, pre) {
    editId = id;
    prefill = pre || {};
    tab = 'dev';
    document.querySelectorAll('#sp-smart .sm-tab').forEach(x => x.classList.toggle('active', x.getAttribute('data-t') === 'dev'));
    document.querySelectorAll('#sp-smart .sm-pane').forEach(p => p.classList.toggle('active', p.id === 'sm-dev'));
    render();
    const n = $('f-name');
    if (n) n.focus();
  }

  async function cmd(id, action, value) {
    const r = await api('POST', '/api/smart/cmd', { id, action, value });
    if (r.status === 200) {
      scheduleRefresh();
    } else {
      toast('Умный дом', (r.d && r.d.error) || 'команда не выполнена', true);
    }
  }

  function toggleSay(card, id) {
    const old = card.querySelector('[data-sayrow]');
    if (old) { old.remove(); return; }
    const acts = card.querySelector('.sm-acts');
    if (!acts) return;
    const row = document.createElement('div');
    row.className = 'sm-sayrow';
    row.dataset.sayrow = '1';
    row.innerHTML = `<input class="sm-in" placeholder="Что сказать через Алису…" autocomplete="off">
      <button class="btn mini">➤</button>`;
    const inp = row.querySelector('input');
    const send = () => {
      const t = inp.value.trim();
      if (!t) return;
      row.remove();
      cmd(id, 'say', t);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    row.querySelector('button').onclick = send;
    acts.appendChild(row);
    row.scrollIntoView({ block: 'nearest' });
    inp.focus();
  }

  function renderHost() {
    const box = $('sm-host');
    if (!box) return;
    const hosts = data.hosts || [];
    if (!hosts.length) {
      box.innerHTML = `<div class="empty-state">Сеть не сканировалась или открытых устройств не найдено
        <div class="sm-hintbtns"><button class="btn mini" id="sm-host-scan">🔍 Сканировать LAN</button></div>
        <div class="sm-hint">Ищем порты: 1337 (станция Алисы), 6666/6668 (Tuya), 1883 (MQTT), 80/443/8080/8888 (HTTP).</div></div>`;
      const b = $('sm-host-scan');
      if (b) b.onclick = () => $('sm-scan').click();
      return;
    }
    box.innerHTML = hosts.map(h => `
      <div class="sm-host${h.ports && h.ports.length ? '' : ' quiet'}">
        <div class="sm-hmain">
          <b>${esc(h.ip)}</b>
          ${h.mac ? `<span class="sm-mac">${esc(h.mac)}</span>` : ''}
          <span class="sm-ports">${(h.ports || []).map(p => '<span class="sm-port">' + p + '</span>').join('')}</span>
        </div>
        <div class="sm-sub">${h.title ? esc(h.title) + ' · ' : ''}${(h.marks || []).join(', ') || ((h.ports || []).length ? 'без опознавательных знаков' : 'жив, открытых портов не найдено')}</div>
        <div class="sm-acts">${(h.suggest || []).map(s => `
          <button class="btn mini" data-ip="${esc(h.ip)}" data-kind="${s.kind}" data-adapter="${s.adapter}" data-name="${esc(s.name)}" data-meta="${esc(JSON.stringify(s.meta || {}))}"${s.soon ? ' title="' + esc(s.soon) + '"' : ''}>＋ ${esc(s.name)}${s.soon ? ' (' + s.soon + ')' : ''}</button>`).join('')}
          <button class="btn mini link" data-ip="${esc(h.ip)}" data-kind="other" data-adapter="manual" data-name="${esc(h.ip)}" data-meta="{}">＋ своё</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('.sm-acts [data-ip]').forEach(b => b.onclick = () => {
      let meta = {};
      try { meta = JSON.parse(b.getAttribute('data-meta') || '{}'); } catch (e) {}
      openForm(null, {
        ip: b.getAttribute('data-ip'), kind: b.getAttribute('data-kind'),
        adapter: b.getAttribute('data-adapter'), name: b.getAttribute('data-name'), meta
      });
    });
  }

  function renderScene() {
    const box = $('sm-scene');
    if (!box) return;
    const scenes = data.scenes || [];
    const list = scenes.length ? scenes.map(s => `
      <div class="sm-scene${s.enabled ? '' : ' off'}">
        <div class="sm-name">${esc(s.name || 'без имени')}
          <span class="sm-badge">${s.enabled ? 'вкл' : 'выкл'}</span>
          ${s.lastRun ? `<span class="sm-ip">последний запуск ${fmtTime(s.lastRun)}</span>` : ''}
        </div>
        <div class="sm-sub">${esc(triggerText(s))} → ${(s.actions || []).map(a => {
          const d = (data.devices || []).find(x => x.id === a.deviceId);
          return esc((d ? d.name : '?') + ': ' + a.action);
        }).join(', ')}</div>
        <div class="sm-acts">
          <button class="btn mini" data-run="${s.id}">▶ Запустить</button>
          <button class="btn mini" data-toggle="${s.id}">${s.enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
          <button class="btn mini link" data-del="${s.id}">🗑</button>
        </div>
      </div>`).join('') : '';
    box.innerHTML = list + sceneForm();
    box.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      const r = await api('POST', '/api/smart/scene/' + b.getAttribute('data-run') + '/run', {});
      if (r.status !== 200) toast('Умный дом', (r.d && r.d.error) || 'ошибка', true);
      else scheduleRefresh();
    });
    box.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => api('POST', '/api/smart/scene/' + b.getAttribute('data-toggle') + '/toggle', {}).then(scheduleRefresh));
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm('Удалить сценарий?')) return;
      api('POST', '/api/smart/scene/' + b.getAttribute('data-del') + '/delete', {}).then(scheduleRefresh);
    });
    wireSceneForm();
  }

  function triggerText(s) {
    const t = s.trigger || {};
    if (t.type === 'time') return 'в ' + (t.at || '?');
    const d = (data.devices || []).find(x => x.id === t.deviceId);
    const dev = d ? d.name : '?';
    const op = ({ change: 'изменилось', eq: 'стало равно', ne: 'стало не равно', gt: 'больше', lt: 'меньше', rise: 'включилось', fall: 'выключилось' })[t.op || 'change'];
    const field = t.field && t.field !== 'on' ? ' «' + t.field + '»' : '';
    return dev + field + ': ' + op + (t.value !== undefined && t.value !== null && ['eq', 'ne', 'gt', 'lt'].includes(t.op) ? ' ' + t.value : '');
  }

  function sceneForm() {
    return `<div class="sm-form" id="sc-form">
      <div class="sm-ftitle">⚡ Новый сценарий</div>
      <input class="sm-in" id="sc-name" placeholder="Название (например, Утро)">
      <div class="sm-frow">
        <select class="sm-in" id="sc-ttype"><option value="state">Изменение устройства</option><option value="time">По времени</option></select>
        <input class="sm-in" id="sc-at" placeholder="ЧЧ:ММ" value="08:00" style="display:none">
      </div>
      <div class="sm-frow" id="sc-state-row">
        <select class="sm-in" id="sc-dev">${devOptions('')}</select>
        <select class="sm-in" id="sc-op">
          <option value="rise">включилось</option><option value="fall">выключилось</option>
          <option value="change">изменилось</option><option value="eq">стало равно</option>
          <option value="ne">стало не равно</option><option value="gt">больше</option><option value="lt">меньше</option>
        </select>
        <input class="sm-in" id="sc-val" placeholder="значение" style="display:none">
      </div>
      <div class="sm-ftitle sm-sub2">Действия</div>
      <div id="sc-acts">
        <div class="sm-frow sc-act">
          <select class="sm-in sc-adev">${devOptions('')}</select>
          <select class="sm-in sc-aact"><option value="on">включить</option><option value="off">выключить</option><option value="toggle">переключить</option><option value="set">задать состояние</option></select>
          <input class="sm-in sc-aval" placeholder="JSON/значение" style="display:none">
        </div>
      </div>
      <div class="sm-frow">
        <button class="btn mini link" id="sc-more">＋ действие</button>
        <button class="btn mini" id="sc-save">Сохранить</button>
      </div>
    </div>`;
  }

  function wireSceneForm() {
    const tt = $('sc-ttype'), at = $('sc-at'), sr = $('sc-state-row'), op = $('sc-op'), val = $('sc-val');
    if (!tt) return;
    tt.onchange = () => {
      const isTime = tt.value === 'time';
      at.style.display = isTime ? '' : 'none';
      sr.style.display = isTime ? 'none' : '';
    };
    op.onchange = () => { val.style.display = ['eq', 'ne', 'gt', 'lt'].includes(op.value) ? '' : 'none'; };
    $('sc-more').onclick = () => {
      const rows = $('sc-acts');
      if (rows.children.length >= 4) return;
      const row = rows.children[0].cloneNode(true);
      row.querySelector('.sc-aval').value = '';
      rows.appendChild(row);
      bindActRow(row);
    };
    $('sc-acts').querySelectorAll('.sc-act').forEach(bindActRow);
    $('sc-save').onclick = async () => {
      const trigger = tt.value === 'time'
        ? { type: 'time', at: at.value.trim() }
        : { type: 'state', deviceId: $('sc-dev').value, op: op.value, field: 'on', value: val.value.trim() };
      if (trigger.type === 'state' && ['eq', 'ne', 'gt', 'lt'].includes(trigger.op)) {
        const n = Number(trigger.value);
        trigger.value = String(trigger.value) === String(n) ? n : trigger.value;
      }
      const actions = Array.from($('sc-acts').querySelectorAll('.sc-act')).map(row => {
        const a = { deviceId: row.querySelector('.sc-adev').value, action: row.querySelector('.sc-aact').value };
        if (a.action === 'set') {
          const raw = row.querySelector('.sc-aval').value.trim();
          try { a.value = JSON.parse(raw || 'null'); } catch (e) { a.value = raw; }
        }
        return a;
      }).filter(a => a.deviceId);
      const r = await api('POST', '/api/smart/scene', { name: $('sc-name').value.trim(), trigger, actions });
      if (r.status === 200) { toast('Умный дом', 'Сценарий сохранён'); refresh(); }
      else toast('Умный дом', (r.d && r.d.error) || 'ошибка', true);
    };
  }

  function bindActRow(row) {
    const a = row.querySelector('.sc-aact'), v = row.querySelector('.sc-aval');
    a.onchange = () => { v.style.display = a.value === 'set' ? '' : 'none'; };
  }

  function renderLog() {
    const box = $('sm-log');
    if (!box) return;
    const evs = data.events || [];
    if (!evs.length) { box.innerHTML = '<div class="empty-state">Событий пока не было</div>'; return; }
    box.innerHTML = evs.map(e => `
      <div class="sm-ev ${esc(e.kind || '')}">
        <span class="sm-ev-t">${fmtTime(e.ts)}</span>
        <span class="sm-ev-x">${esc(e.text || e.type || '')}</span>
      </div>`).join('');
  }

  /* ---------------- вход в Яндекс по QR (Алиса) ---------------- */

  function renderYa() {
    const box = $('sm-ya');
    if (!box) return;
    const a = (data && data.auth) || { state: data && data.yandex ? 'ready' : 'none' };
    let html = '';
    if (a.state === 'ready') {
      html = `<div class="sm-ya-ready">✅ Алиса подключена <button class="btn mini link" id="sm-ya-del">отозвать токен</button></div>`;
    } else if (a.state === 'pending') {
      const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&qzone=1&data=' + encodeURIComponent(a.url + '?code=' + a.user_code);
      html = `<div class="sm-ya-qr">
        <img src="${qr}" alt="QR" title="Отсканируйте камерой Яндекса или телефона">
        <div class="sm-ya-inf">
          <b>Вход в Яндекс</b>
          <div class="sm-ya-sub">Отсканируйте QR камерой (app «Яндекс» или «Алиса, это QR-код») или откройте
            <nobr><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a></nobr> и введите код</div>
          <div class="sm-ya-code">${a.user_code}</div>
          <div class="sm-ya-sub"><b>Важно:</b> после входа нажмите на странице кнопку подтверждения — токен появится автоматически, закрывать окно не надо.</div>
          <div class="sm-ya-sub">осталось ≈ <b id="sm-ya-left">${esc(String(a.left))}</b> с</div>
          <div class="sm-ya-acts">
            <button class="btn mini link" id="sm-ya-stop">отмена</button>
          </div>
        </div>
      </div>`;
    } else if (a.state === 'denied') {
      html = `<div class="sm-ya-warn">Вход отклонён в приложении. <button class="btn mini" id="sm-ya-start">🔑 Войти заново</button></div>`;
    } else if (a.state === 'expired') {
      html = `<div class="sm-ya-warn">Код истёк. <button class="btn mini" id="sm-ya-start">🔑 Войти ещё раз</button></div>`;
    } else {
      html = `<div class="sm-ya-open">
        <button class="btn mini" id="sm-ya-start">🔑 Войти в Яндекс (QR)</button>
        <span class="sm-ya-hint">Нужно для управления станцией Алисы: распознавание команд, TTS, вкл/выкл.</span>
      </div>`;
    }
    box.innerHTML = html;
    const start = $('sm-ya-start');
    if (start) start.onclick = yaStart;
    const stop = $('sm-ya-stop');
    if (stop) stop.onclick = yaStop;
    const del = $('sm-ya-del');
    if (del) del.onclick = yaRemove;
    if (a.state === 'pending') scheduleYaPoll(a.interval || 5);
    else stopYaPoll();
  }

  function scheduleYaPoll(interval) {
    if (yaTimer) return;
    yaTimer = setTimeout(async () => {
      yaTimer = null;
      const seq = ++yaSeq;
      const r = await api('POST', '/api/smart/auth', { action: 'status' });
      if (seq !== yaSeq) return;
      if (r.status === 200 && r.d && r.d.auth) {
        if (r.d.auth.state === 'ready') toast('Умный дом', 'Яндекс: токен получен ✓');
        data.auth = r.d.auth;
        data.yandex = data.auth.state === 'ready' ? true : data.yandex;
        renderYa();
      }
      const st = (data.auth && data.auth.state) || (data.yandex ? 'ready' : 'none');
      if (st === 'pending') scheduleYaPoll(data.auth.interval || 5);
      else stopYaPoll();
    }, Math.max(3000, (interval || 5) * 1000));
  }

  function stopYaPoll() { yaTimer = null; yaSeq++; }

  async function yaStart() {
    stopYaPoll();
    const r = await api('POST', '/api/smart/auth', { action: 'start' });
    if (r.status === 200 && r.d && r.d.auth) { data.auth = r.d.auth; if (r.d.auth.state !== 'ready') data.yandex = false; renderYa(); }
    else toast('Умный дом', (r.d && r.d.error) || 'не удалось начать вход', true);
  }

  function yaStop() {
    stopYaPoll();
    api('POST', '/api/smart/auth', { action: 'stop' }).then(r => { if (r.status === 200) refresh(); });
  }

  function yaRemove() {
    api('POST', '/api/smart/config', { yandexToken: '' }).then(r => refresh());
  }

  /* ---------------- события сервера ---------------- */

  function openEvents() {
    if (!window.EventSource || es) return;
    try {
      es = new EventSource('/api/smart/events');
      es.onmessage = (ev) => {
        let d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.replay) return;
        if (d.type === 'scan') {
          if (d.phase === 'start') setStatus('сканирую… ' + d.total + ' адресов');
          if (d.phase === 'progress') setStatus((d.stage === 'ping' ? 'ping… ' : 'порты… ') + d.done + '/' + d.total);
          if (d.phase === 'done') {
            setStatus('готово: ' + d.found + ' живых');
            toast('Умный дом', 'Скан завершён: ' + d.found + ' живых хостов' +
              (d.withPorts ? ', из них с открытыми портами ' + d.withPorts : ''));
            scheduleRefresh();
          }
          if (d.phase === 'error') { setStatus('ошибка скана'); toast('Умный дом', d.text || 'скан не удался', true); }
          return;
        }
        if (d.type === 'smart') {
          toast('🏠 ' + (d.name || 'Умный дом'), d.text || '');
          scheduleRefresh();
        }
      };
      es.onerror = () => {};
    } catch (e) {}
  }

  window.SMART = { load };
})();
