'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const STORE = lang => 'kban-sandbox-code-' + lang;
  const EXAMPLES = {
    python: 'print("Привет из Python!")\nfor i in range(1, 6):\n    print(i, i * i)\n',
    node: 'console.log("Привет из Node.js!");\nfor (let i = 1; i <= 5; i++) console.log(i, i * i);\n',
    bash: 'echo "Привет из Bash!"\nfor i in 1 2 3 4 5; do echo "$i $((i * i))"; done\n'
  };
  let started = false;
  let info = null;

  function currentLang() {
    const s = $('sb-lang');
    return s ? s.value : 'python';
  }

  function setBadge(text, ok) {
    const b = $('sb-badge');
    if (!b) return;
    b.textContent = text;
    b.classList.toggle('off', ok === false);
  }

  function saveCode() {
    const ta = $('sb-code');
    if (!ta) return;
    try { localStorage.setItem(STORE(currentLang()), ta.value); } catch (e) {}
  }

  function loadCode() {
    const ta = $('sb-code');
    if (!ta) return;
    let code = '';
    try { code = localStorage.getItem(STORE(currentLang())) || ''; } catch (e) {}
    ta.value = code || EXAMPLES[currentLang()] || '';
    ta.placeholder = 'Напишите код и нажмите «Запустить»…';
  }

  function setStatus(text, cls) {
    const s = $('sb-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'sb-status' + (cls ? ' ' + cls : '');
  }

  function renderResult(d) {
    const out = $('sb-out');
    if (!out) return;
    const parts = [];
    if (d.stdout) parts.push(d.stdout);
    if (d.stderr) parts.push((d.stdout ? '\n' : '') + d.stderr);
    if (!parts.length) parts.push(d.ok ? '(пустой вывод)' : '(нет вывода)');
    if (d.warning) parts.push('\n⚠ ' + d.warning);
    if (d.truncated) parts.push('\n⚠ вывод обрезан (лимит 256 КБ)');
    if (d.timedOut) parts.push('\n⏱ таймаут — процесс остановлен');
    out.textContent = parts.join('');
  }

  async function run() {
    const ta = $('sb-code');
    const btn = $('sb-run');
    if (!ta || !btn) return;
    const code = ta.value;
    if (!code.trim()) { setStatus('пустой код', 'err'); return; }
    const lang = currentLang();
    const timeout = parseInt(($('sb-timeout') || {}).value || '10000', 10);
    const stdin = $('sb-stdin-toggle') && $('sb-stdin-toggle').checked ? ($('sb-stdin') || {}).value || '' : '';
    btn.disabled = true;
    setStatus('выполняется…');
    const started = Date.now();
    try {
      const r = await fetch('/api/sandbox/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, code, stdin, timeout })
      });
      const d = await r.json().catch(() => ({}));
      renderResult(d);
      if (!r.ok) {
        setStatus('ошибка: ' + (d.error || r.status), 'err');
        return;
      }
      const ms = d.ms != null ? d.ms : Date.now() - started;
      const iso = d.isolated ? 'bwrap' : 'без изоляции';
      if (d.timedOut) setStatus('таймаут · ' + ms + ' мс · ' + iso, 'err');
      else if (d.ok) setStatus('exit 0 · ' + ms + ' мс · ' + iso, 'ok');
      else setStatus('exit ' + (d.code == null ? '?' : d.code) + ' · ' + ms + ' мс · ' + iso, 'err');
    } catch (e) {
      renderResult({ ok: false, stderr: String((e && e.message) || e) });
      setStatus('ошибка сети', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function init() {
    if (started) return;
    started = true;
    loadCode();
    try {
      const r = await fetch('/api/sandbox/info');
      info = await r.json();
      if (info && info.bwrap) setBadge('bwrap: включён', true);
      else setBadge('bwrap: не найден (без изоляции)', false);
    } catch (e) {
      setBadge('окружение недоступно', false);
    }
    const lang = $('sb-lang');
    if (lang) lang.onchange = () => { saveCode(); loadCode(); };
    const code = $('sb-code');
    if (code) code.addEventListener('input', saveCode);
    const runBtn = $('sb-run');
    if (runBtn) runBtn.onclick = run;
    const clearBtn = $('sb-clear');
    if (clearBtn) clearBtn.onclick = () => {
      const ta = $('sb-code');
      if (ta) ta.value = '';
      saveCode();
      const out = $('sb-out');
      if (out) out.textContent = '';
      setStatus('');
    };
    const exBtn = $('sb-example');
    if (exBtn) exBtn.onclick = () => {
      const ta = $('sb-code');
      if (ta) { ta.value = EXAMPLES[currentLang()] || ''; saveCode(); }
    };
    const stdinToggle = $('sb-stdin-toggle');
    if (stdinToggle) stdinToggle.onchange = () => {
      const s = $('sb-stdin');
      if (s) s.classList.toggle('hidden', !stdinToggle.checked);
    };
    const copyBtn = $('sb-copy');
    if (copyBtn) copyBtn.onclick = () => {
      const out = $('sb-out');
      if (!out) return;
      try { navigator.clipboard.writeText(out.textContent || ''); copyBtn.textContent = 'Скопировано'; }
      catch (e) {}
      setTimeout(() => { copyBtn.textContent = 'Копировать'; }, 1200);
    };
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.body.getAttribute('data-view') === 'sandbox') {
        e.preventDefault();
        run();
      }
    });
  }

  window.SANDBOX = { init, run };
})();
