(function () {
  async function load(target) {
    const root = target || document.getElementById('w-sounds');
    if (!root) return;
    root.innerHTML = `
      <div class="card-glass" style="min-height:auto">
        <div class="card-header"><span class="card-title">Звуки уведомлений</span></div>
        <div class="card-body">
          <div class="field">
            <label>Звук по умолчанию</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="range" id="snd-vol" min="0" max="1" step="0.1" style="flex:1">
              <span id="snd-volv" class="card-sub">0.6</span>
            </div>
          </div>
          <div class="field" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="snd-default" style="flex:1;min-width:160px"></select>
            <button class="btn-ghost" id="snd-play-def">Прослушать</button>
            <button class="btn-ghost" id="snd-save-def">Сохранить</button>
          </div>
          <hr style="opacity:0.2">
          <div class="card-header"><span class="card-title">Правила по приложению/тексту</span></div>
          <div id="snd-rules" style="display:flex;flex-direction:column;gap:8px"></div>
          <button class="btn-ghost" id="snd-add">+ Добавить правило</button>
        </div>
      </div>
    `;
    const vol = document.getElementById('snd-vol');
    const volv = document.getElementById('snd-volv');
    const defSel = document.getElementById('snd-default');
    const playDef = document.getElementById('snd-play-def');
    const saveDef = document.getElementById('snd-save-def');
    const rulesDiv = document.getElementById('snd-rules');
    const addBtn = document.getElementById('snd-add');

    const cfg = await fetch('/api/sounds/config').then(r=>r.json()).then(x=>x.config);
    vol.value = cfg.default.volume || 0.6;
    volv.textContent = vol.value;
    vol.oninput = ()=>{volv.textContent=vol.value;};

    async function refreshList() {
      const files = await fetch('/api/files?dir=uploads/sounds').then(r=>r.json()).then(x=>x.files||[]);
      defSel.innerHTML = files.map(f=>`<option value="${f.path}" ${cfg.default.src.endsWith(f.name)?'selected':''}>${f.name}</option>`).join('');
      if(!defSel.value) defSel.value = cfg.default.src;
    }
    await refreshList();

    function renderRules() {
      rulesDiv.innerHTML = (cfg.rules||[]).map((r,i)=>`
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input placeholder="Паттерн (app/title/text)" value="${escapeHtml(r.pattern||'')}" data-pat="${i}" style="flex:1;min-width:120px">
          <input type="range" min="0" max="1" step="0.1" value="${r.volume||cfg.default.volume}" data-volr="${i}" style="width:120px">
          <select data-sr="${i}">${(cfg.rulesFiles||[]).map(f=>`<option value="${f.path}" ${r.src&&r.src.endsWith(f.name)?'selected':''}>${f.name}</option>`).join('')}</select>
          <button class="btn-ghost" data-del="${i}">×</button>
        </div>
      `).join('');
      rulesDiv.querySelectorAll('[data-pat]').forEach(inp=>inp.onchange=e=>{
        const idx=parseInt(e.target.dataset.pat); cfg.rules[idx].pattern=e.target.value;
      });
      rulesDiv.querySelectorAll('[data-volr]').forEach(inp=>inp.oninput=e=>{
        const idx=parseInt(e.target.dataset.volr); cfg.rules[idx].volume=parseFloat(e.target.value);
      });
      rulesDiv.querySelectorAll('[data-sr]').forEach(sel=>sel.onchange=e=>{
        const idx=parseInt(e.target.dataset.sr); cfg.rules[idx].src=e.target.value;
      });
      rulesDiv.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=e=>{
        const idx=parseInt(e.target.dataset.del); cfg.rules.splice(idx,1); renderRules();
      });
    }
    cfg.rulesFiles = (await fetch('/api/files?dir=uploads/sounds').then(r=>r.json())).files||[];
    renderRules();

    addBtn.onclick = ()=>{
      cfg.rules.push({pattern:'',volume:cfg.default.volume,src:cfg.default.src,enabled:true});
      renderRules();
    };

    playDef.onclick = ()=>{
      const a=document.getElementById('notif-sound');
      if(!a)return;
      a.src=defSel.value;
      a.volume=parseFloat(vol.value);
      a.play().catch(()=>{});
    };

    saveDef.onclick = async ()=>{
      cfg.default.volume=parseFloat(vol.value);
      cfg.default.src=defSel.value;
      await fetch('/api/sounds/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({default:cfg.default,rules:cfg.rules})});
      alert('Сохранено');
    };
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
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
