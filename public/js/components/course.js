'use strict';
/* Вкладка «Курс»: чтение глав kurs/*.md прямо в браузере.
   Свой мини-рендерер markdown (без внешних библиотек). */
(function () {
  const CONTENT = document.getElementById('course-content');
  const TOC = document.getElementById('course-toc-list');
  const SEARCH = document.getElementById('course-search');
  const PREV = document.getElementById('course-prev');
  const NEXT = document.getElementById('course-next');
  const POS = document.getElementById('course-pos');
  const FILL = document.getElementById('course-progress-fill');
  if (!CONTENT) return;

  const LS_KEY = 'nb-course-chapter';
  let files = [];
  let current = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function slug(text) {
    return String(text).toLowerCase()
      .replace(/[`*_[\]()]/g, '')
      .replace(/[^\wа-яё\s-]/gi, '')
      .trim().replace(/\s+/g, '-');
  }

  /* ---------- inline ---------- */
  function inline(text) {
    let s = text;
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => {
      codes.push(c);
      return '\u0000C' + (codes.length - 1) + '\u0000';
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
      const name = src.replace(/^\.?\/?(?:kurs\/)?(?:img\/)?/, '');
      if (/^img\//.test(src) || /\.png$/i.test(name) || /\.jpe?g$/i.test(name) || /\.webp$/i.test(name)) {
        return '<img class="course-img" loading="lazy" alt="' + esc(alt) + '" src="/api/course/img?name=' + encodeURIComponent(name) + '">';
      }
      return '<img class="course-img" loading="lazy" alt="' + esc(alt) + '" src="' + esc(src) + '">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
      if (/^#/.test(href)) return '<a class="course-anchor" href="' + esc(href) + '">' + label + '</a>';
      if (/\.md$/i.test(href)) {
        const chap = href.replace(/^\.\//, '');
        return '<a class="course-link" data-chapter="' + esc(chap) + '" href="#">' + label + '</a>';
      }
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\u0000C(\d+)\u0000/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
    return s;
  }

  /* ---------- block ---------- */
  function render(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let list = null; // {type:'ul'|'ol', items:[{text, task}]}

    function closeList() {
      if (!list) return;
      out.push('<' + list.type + ' class="course-list ' + (list.task ? 'course-task' : '') + '">');
      for (const it of list.items) {
        if (it.task) {
          const checked = it.task === 'x';
          out.push('<li class="course-task-item"><label><input type="checkbox" class="course-check"' + (checked ? ' checked' : '') + '> ' + inline(it.text) + '</label></li>');
        } else {
          out.push('<li>' + inline(it.text) + '</li>');
        }
      }
      out.push('</' + list.type + '>');
      list = null;
    }

    while (i < lines.length) {
      let line = lines[i];

      // fenced code
      const fence = /^```(\S*)\s*$/.exec(line);
      if (fence) {
        closeList();
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip closing
        const code = buf.join('\n');
        out.push('<div class="course-code">' +
          '<div class="course-code-head"><span>' + esc(lang || 'код') + '</span>' +
          '<button class="course-copy" type="button">Копировать</button></div>' +
          '<pre><code>' + esc(code) + '</code></pre></div>');
        continue;
      }

      // hr
      if (/^---+\s*$/.test(line)) { closeList(); out.push('<hr>'); i++; continue; }

      // heading
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        closeList();
        const lvl = h[1].length;
        const text = h[2].trim();
        out.push('<h' + lvl + ' id="' + slug(text) + '">' + inline(text) + '</h' + lvl + '>');
        i++; continue;
      }

      // table
      if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
        closeList();
        const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|.*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        let t = '<table class="course-table"><thead><tr>';
        for (const c of head) t += '<th>' + inline(c) + '</th>';
        t += '</tr></thead><tbody>';
        for (const r of rows) {
          t += '<tr>';
          for (const c of r) t += '<td>' + inline(c) + '</td>';
          t += '</tr>';
        }
        t += '</tbody></table>';
        out.push(t);
        continue;
      }

      // blockquote (single-line enough; merge consecutive)
      if (/^>\s?/.test(line)) {
        closeList();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote class="course-quote">' + buf.map(b => inline(b)).join('<br>') + '</blockquote>');
        continue;
      }

      // task list / list
      const task = /^-\s+\[([ xX])\]\s+(.*)$/.exec(line);
      const ul = /^[-*]\s+(.*)$/.exec(line);
      const ol = /^(\d+)\.\s+(.*)$/.exec(line);
      if (task) {
        if (!list || list.type !== 'ul') { closeList(); list = { type: 'ul', items: [], task: true }; }
        list.task = true;
        list.items.push({ text: task[2], task: task[1].toLowerCase() });
        i++; continue;
      }
      if (ul) {
        if (!list || list.type !== 'ul') { closeList(); list = { type: 'ul', items: [], task: false }; }
        list.items.push({ text: ul[1] });
        i++; continue;
      }
      if (ol) {
        if (!list || list.type !== 'ol') { closeList(); list = { type: 'ol', items: [], task: false }; }
        list.items.push({ text: ol[2] });
        i++; continue;
      }

      // blank
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }

      // raw HTML line (trusted content): details/summary etc — pass through, escaping inner code
      if (/^\s*</.test(line)) {
        closeList();
        out.push(line.replace(/<code>/g, '<code>'));
        i++; continue;
      }

      // paragraph
      closeList();
      const buf = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(```|#{1,4}\s|>|\||[-*]\s|\d+\.\s|---+\s*$)/.test(lines[i]) && !/^\s*</.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }
    closeList();
    return out.join('\n');
  }

  /* ---------- data ---------- */
  async function loadList() {
    try {
      const r = await fetch('/api/course/list');
      const d = await r.json();
      files = d.files || [];
    } catch (e) { files = []; }
    renderToc();
  }

  function renderToc(filter) {
    TOC.innerHTML = '';
    const q = (filter || '').toLowerCase().trim();
    files.forEach((f, idx) => {
      if (q && !(f.title.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))) return;
      const a = document.createElement('a');
      a.className = 'course-toc-item' + (f.kind === 'intro' ? ' intro' : f.kind === 'answers' ? ' answers' : '');
      a.href = '#';
      a.dataset.chapter = f.name;
      const badge = f.kind === 'chapter' ? '<span class="course-toc-num">' + f.num + '</span>' : '<span class="course-toc-num">' + (f.kind === 'intro' ? '★' : '—') + '</span>';
      a.innerHTML = badge + '<span class="course-toc-title">' + esc(f.title) + '</span>';
      TOC.appendChild(a);
    });
  }

  async function open(name, push) {
    let r;
    try { r = await fetch('/api/course/file?name=' + encodeURIComponent(name)); } catch (e) { return; }
    if (!r.ok) { CONTENT.innerHTML = '<p class="course-empty">Не удалось открыть главу.</p>'; return; }
    const md = await r.text();
    current = name;
    CONTENT.innerHTML = render(md);
    content_ = CONTENT;
    CONTENT.scrollIntoView ? window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }) : null;
    TOC.querySelectorAll('.course-toc-item').forEach(el => {
      el.classList.toggle('active', el.dataset.chapter === name);
    });
    localStorage.setItem(LS_KEY, name);
    updateNav();
    hookCopy();
    document.body.classList.remove('course-toc-open');
  }

  let content_ = CONTENT;

  function updateNav() {
    const idx = files.findIndex(f => f.name === current);
    const file = files[idx];
    PREV.disabled = idx <= 0;
    NEXT.disabled = idx < 0 || idx >= files.length - 1;
    POS.textContent = (idx + 1) + ' / ' + files.length + (file ? ' · ' + file.title : '');
    FILL.style.width = files.length ? (((idx + 1) / files.length) * 100) + '%' : '0%';
  }

  function step(delta) {
    const idx = files.findIndex(f => f.name === current);
    const next = files[idx + delta];
    if (next) open(next.name);
  }

  function hookCopy() {
    CONTENT.querySelectorAll('.course-copy').forEach(btn => {
      if (btn._hooked) return;
      btn._hooked = true;
      btn.addEventListener('click', () => {
        const code = btn.closest('.course-code').querySelector('code');
        const text = code ? code.textContent : '';
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Скопировано ✓';
          setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
        }).catch(() => {});
      });
    });
  }

  /* ---------- events ---------- */
  TOC.addEventListener('click', e => {
    const a = e.target.closest('[data-chapter]');
    if (!a) return;
    e.preventDefault();
    open(a.dataset.chapter);
  });
  CONTENT.addEventListener('click', e => {
    const img = e.target.closest('.course-img');
    if (img) {
      const ov = document.createElement('div');
      ov.className = 'course-lightbox';
      ov.innerHTML = '<img src="' + img.src + '" alt="">';
      ov.addEventListener('click', () => ov.remove());
      document.body.appendChild(ov);
      return;
    }
    const a = e.target.closest('.course-link');
    if (a) { e.preventDefault(); open(a.dataset.chapter); return; }
    const an = e.target.closest('.course-anchor');
    if (an) {
      e.preventDefault();
      const id = decodeURIComponent(an.getAttribute('href').slice(1));
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  PREV.addEventListener('click', () => step(-1));
  NEXT.addEventListener('click', () => step(1));
  SEARCH.addEventListener('input', () => renderToc(SEARCH.value));

  document.addEventListener('keydown', e => {
    if (document.body.dataset.view !== 'course') return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  let inited = false;
  async function init() {
    if (inited) { return; }
    inited = true;
    await loadList();
    const last = localStorage.getItem(LS_KEY);
    const start = (last && files.some(f => f.name === last)) ? last : (files[0] && files[0].name);
    if (start) open(start);
  }

  window.COURSE = { init, open };
})();
