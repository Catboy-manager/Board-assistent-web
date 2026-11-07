# Глава 10. Модули и как добавлять фичи

> **Цель главы:** перестать писать «одну большую программу» и научиться добавлять фичи, не трогая чужой код. В конце — пошаговый рецепт новой панели.

---

## 10.1 Проблема монолита

Представьте `server.js` на 3000 строк, где фильмы, новости, музыка, уведомления и умный дом перемешаны. Каждая правка рискует сломать соседа. Такой файл невозможно держать в голове.

Проект решает это **модулями**: одна фича — один файл. Ядро (`server.js`) только «дирижирует».

```text
server.js  ── require ──▶  movies.js, news.js, notify.js, smart.js, …
    │                             │
    └── роутер: /api/movies ──────▶ movies.handle(...)
```

Правило из `AGENTS.md`: **новые фичи — в модулях, а не в `server.js`.**

---

## 10.2 Паттерн модуля проекта

Каждый серверный модуль — функция, которая получает «инструменты» и возвращает объект с `handle`:

```js
// moves.js (пример каркаса)
'use strict';

module.exports = (deps) => {
  const { dataDir, readBody, json, cfg } = deps;
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(dataDir, 'example.json');
  let store = load();

  function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { items: [] }; } }
  function save()  { try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch (e) {} }

  // ГЛАВНОЕ: вернуть true, если запрос обработан (иначе сервер пойдёт дальше по роутеру)
  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/example') {
      return json(res, 200, store);
    }
    if (req.method === 'POST' && p === '/api/example') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      store.items.push({ id: 'x' + Date.now().toString(36), title: String(body.title || '') });
      save();
      return json(res, 200, { ok: true });
    }
    return false;   // не моё — пусть обрабатывает кто-то другой
  }

  return { handle };
};
```

Разбор контракта:

| Часть | Смысл |
|---|---|
| `deps` | Инструменты от ядра: `dataDir`, `json`, `readBody`, `cfg`… Модуль **не имеет права** лазить в глобалы ядра |
| `handle(p, url, req, res)` | Разбирает свои пути (все начинаются с `/api/example`) |
| **return truthy/false** | `json()` возвращает `true` — значит «обработано». `false` — «это не мой путь» |
| `load/save` | Свой файл в `data/`, своя схема |

Посмотрите на настоящий минимальный модуль целиком — `messages.js` (88 строк): он только считает статистику из данных другого модуля.

```js
module.exports = (deps) => {
  const { json, notify } = deps;          // взял чужую функцию — и всё, без дублирования

  function compute() {
    const hist = notify.history();        // статистика поверх уведомлений
    …
  }
  function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/msgs') return json(res, 200, compute());
    return false;
  }
  return { handle };
};
```

**Урок:** модули могут **опираться друг на друга через параметры**, а не через глобальные переменные.

**Задача 10.1.** Напишите модуль `notes.js` со своими `GET/POST /api/notes` (заметки), по образцу выше. Не забудьте `return false` в конце.

---

## 10.3 Как ядро подключает модули

Три штриха в `server.js`:

```js
// 1) ПОДКЛЮЧЕНИЕ (после других require)
const notes = require('./notes')({ dataDir: DATA_DIR, readBody, json });

// 2) РОУТ (в handleRequest, среди остальных)
if (p.startsWith('/api/notes')) { if (await notes.handle(p, url, req, res)) return; }

// 3) (опционально) врезка в промпт ИИ / общий контекст
```

В проекте есть тонкость: некоторые модули создаются **до** объявления `json`/`readBody`. Это работает благодаря **hoisting функций** (function declarations поднимаются) — но `let config` так не поднять, поэтому, например, `cfg: () => config` передаётся как **функция-геттер**, а не значение:

```js
const games = require('./games')({ …, cfg: () => config, saveCfg: saveConfig });
```

Иначе модуль «навсегда» получил бы `undefined`: в момент `require` переменная `config` ещё не заполнена.

> 💡 Приём `cfg: () => config` встречается в проекте повсюду. Если модулю нужен «живой» доступ к чему-то, что меняется, — передавайте функцию, а не снимок значения.

**Задача 10.2.** Подключите `notes` из 10.1 к своему серверу (глава 6): `require` + строка роутера. Проверьте через `curl`.

---

## 10.4 Клиентский модуль: та же идея

Фронтенд-фича тоже самодостаточна. Типовая структура клиентского файла (`public/js/movies.js`):

```js
'use strict';
(function () {
  let list = [];

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  async function load() {
    try {
      const r = await fetch('/api/movies');
      if (r.ok) list = (await r.json()).movies || [];
    } catch (e) {}
    render();
  }
  function render() { … }

  document.addEventListener('DOMContentLoaded', () => load());  // сам себя включает

  window.MOVIES = { load, openDetail };   // наружу — только нужное
})();
```

Особенности:

- **IIFE `(function(){ … })()`** — всё внутри файла «запечатано», наружу торчит только `window.MOVIES`. Никаких глобальных переменных, конфликтов имён нет.
- **Сам себя инициализирует** на `DOMContentLoaded`.
- Другие модули могут звать `window.MOVIES.openDetail(id)` (так делает `app.js:10`: `if (window.PLACE) PLACE.reload()`).
- Проверка `if (window.X)` перед вызовом — «мягкая связность»: если модуль не подключён, ничего не падает.

**Задача 10.3.** Сделайте клиентский модуль `public/js/notes.js` по образцу: загрузка с `/api/notes`, рендер в контейнер, кнопка добавить. Подключите `<script>` в HTML.

---

## 10.5 Паттерн панели дашборда

Панели на дашборде — это `<section class="side-panel">` с двумя частями-`pane` (вкладки внутри):

```html
<section class="side-panel" id="movies-panel">
  <div class="sp-head"><h2>🎬 Что посмотреть</h2></div>
  <div id="sp-movies" class="sp-pane active"></div>
</section>
```

Клиентский модуль наполняет `#sp-movies`. А «вынести панель на доску окном» умеет `public/js/place.js` — он читает список панелей и превращает их в перетаскиваемые плитки `.bp-tile` в `#board-panels`. Это уже «фича поверх фич»; разбирать её целиком не обязательно, но полезно знать, что **одна инфраструктура (окна на доске) обслуживает все панели сразу**.

---

## 10.6 Пошаговый рецепт: добавляем новую фичу «Привычки» 🎯

Сделаем полноценную фичу end-to-end. План:

### Шаг 1. Данные

`data/habits.json`:

```json
{ "items": [ { "id": "h1", "title": "Читать 20 минут", "days": [1700000000000], "streak": 1 } ] }
```

### Шаг 2. Серверный модуль `habits.js`

```js
'use strict';
module.exports = (deps) => {
  const { dataDir, readBody, json } = deps;
  const fs = require('fs');
  const path = require('path');
  const FILE = path.join(dataDir, 'habits.json');

  let store = { items: [] };
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  function save() { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch (e) {} }
  function uid() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/habits') return json(res, 200, store);

    if (req.method === 'POST' && p === '/api/habits') {
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const title = String(b.title || '').trim().slice(0, 80);
      if (!title) return json(res, 400, { error: 'нужен title' });
      const item = { id: uid(), title, days: [], streak: 0 };
      store.items.push(item); save();
      return json(res, 200, item);
    }

    const m = p.match(/^\/api\/habits\/([^/]+)\/check$/);
    if (req.method === 'POST' && m) {
      const item = store.items.find(x => x.id === m[1]);
      if (!item) return json(res, 404, { error: 'нет привычки' });
      const today = new Date().toISOString().slice(0, 10);
      if (!item.days.includes(today)) item.days.push(today);
      item.streak = computeStreak(item.days);
      save();
      return json(res, 200, item);
    }
    return false;
  }

  function computeStreak(days) {
    let n = 0;
    for (let i = 0; ; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      if (days.includes(d)) n++; else break;
    }
    return n;
  }

  return { handle };
};
```

### Шаг 3. Подключить в `server.js`

```js
const habits = require('./habits')({ dataDir: DATA_DIR, readBody, json });
// …в роутере:
if (p.startsWith('/api/habits')) { if (await habits.handle(p, url, req, res)) return; }
```

### Шаг 4. HTML-панель

```html
<section class="side-panel" id="habits-panel">
  <div class="sp-head"><h2>🎯 Привычки</h2></div>
  <div id="sp-habits" class="sp-pane active"></div>
</section>
```

### Шаг 5. Клиент `public/js/habits.js`

```js
'use strict';
(function () {
  let items = [];
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  async function load() {
    try { const r = await fetch('/api/habits'); if (r.ok) items = (await r.json()).items || []; } catch (e) {}
    render();
  }
  function render() {
    const box = $('sp-habits'); if (!box) return;
    box.innerHTML = `
      <div class="sw-add"><input id="hb-new" placeholder="Новая привычка…"><button id="hb-add">+</button></div>
      ${items.map(it => `<div class="hb-item"><span>${esc(it.title)}</span>
        <span class="hb-streak">🔥 ${it.streak}</span>
        <button class="btn" data-hb-check="${it.id}">✓</button></div>`).join('') || '<div class="empty-state">Пока пусто</div>'}`;
    $('hb-add').onclick = add;
    box.querySelectorAll('[data-hb-check]').forEach(b => b.onclick = () => check(b.dataset.hbCheck));
  }
  async function add() {
    const i = $('hb-new'); const t = i.value.trim(); if (!t) return; i.value = '';
    await fetch('/api/habits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
    load();
  }
  async function check(id) { await fetch('/api/habits/' + encodeURIComponent(id) + '/check', { method: 'POST' }); load(); }

  document.addEventListener('DOMContentLoaded', load);
  window.HABITS = { load };
})();
```

### Шаг 6. Стили и подключение скрипта

Добавьте `.hb-item { display:flex; gap:8px; align-items:center; }` в CSS и `<script src="/js/habits.js"></script>` перед `</body>` в `index.html`.

### Шаг 7. Проверка

```bash
node --check habits.js && node --check public/js/habits.js
curl -s http://localhost:8090/api/habits
curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"Зарядка"}' http://localhost:8090/api/habits
```

**Задача 10.4 (главная).** Реализуйте «Привычки» по этому рецепту целиком в своём мини-канбане: отдельный модуль, свой JSON, панель, кнопки, счётчик стрика. Это и есть экзамен главы.

---

## 10.7 Итоговый чек-лист «новая фича»

При добавлении любой фичи проверьте:

- [ ] **Свои данные** — отдельный файл в `data/` со своей схемой
- [ ] **Своё API** — префикс `/api/<фича>`, модуль с `handle()`, `return false` в конце
- [ ] **Подключение в `server.js`** — `require` + строка роутера (не логика!)
- [ ] **Свой клиентский файл** — IIFE, `window.<ФИЧА>`, сам инициализируется
- [ ] **Разметка** — своя секция и контейнер, `data-*` для связи
- [ ] **Стили** — свои классы с префиксом (`.hb-`, `.sm-`), чтобы не конфликтовать
- [ ] **`esc()`** на всех пользовательских данных
- [ ] **Валидация** входных данных на сервере (400 на мусор)
- [ ] **`node --check`** на всех правленых `.js`
- [ ] **Секреты** — не в git, не в общей доске

Если фича трогает **общий веб-код** — не забыть про десктоп-синхронизацию (см. `AGENTS.md`): тот же код уезжает в Electron-обёртки `linux/app/` и `windows/app/app/`.

---

## ✅ Задачи главы 10 (самостоятельная работа)

1. Модуль `notes.js` + подключение (10.1–10.2).
2. Клиент `public/js/notes.js` (10.3).
3. **Фича целиком** — «Привычки» (10.6).
4. **Вторая фича** — «Цитата дня»: сервер раз в сутки (или по кнопке) берёт случайную цитату из своего списка, отдаёт `/api/quote`; клиент показывает в панели.
5. **Разбор.** Возьмите `movies.js` (сервер) и найдите: где `handle` возвращает `false`, где грузится и сохраняется файл, где вызывается внешний поиск постера. Опишите словами.
6. **Рефакторинг.** Возьмите любой свой мини-проект-«монолит» и вынесите одну фичу в модуль по этому паттерну.

**Приёмка:** фича «Привычки» работает end-to-end (данные, API, панель, проверка через `curl` и в браузере), код лежит в отдельном файле, `server.js` вырос на 2 строки.

**Дальше → [Глава 11. Итоговый проект по шагам](11-itogovyy-proekt.md)**
