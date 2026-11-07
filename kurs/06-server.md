# Глава 6. Сервер на Node.js

> **Цель главы:** написать свой HTTP-сервер, который отдаёт страницу и принимает данные. К концу главы у вас будет рабочее API доски, проверенное через `curl` и браузер.

---

## 6.1 Минимальный сервер: 6 строк

Создайте `~/my-kanban/server.js`:

```js
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Привет из Node!');
});

server.listen(8090, '127.0.0.1', () => {
  console.log('Сервер: http://127.0.0.1:8090');
});
```

```bash
node server.js
# в другом терминале:
curl -i http://127.0.0.1:8090
```

Что произошло:

- `http.createServer(handler)` — создали сервер; `handler` вызывается на **каждый** запрос.
- `req` (request) — входящий запрос: метод, путь, заголовки, тело.
- `res` (response) — ответ: `writeHead` задаёт статус и заголовки, `end` отправляет тело.
- `listen(port, host)` — «начать слушать порт». Второй аргумент — **важно**: `127.0.0.1` слушает только этот ПК, `0.0.0.0` — все сети (нужно для доступа с телефона).

> 📌 `res.end()` можно вызвать **один раз**. Забыли вызвать — браузер будет висеть и ждать вечно.

**Задача 6.1.** Поменяйте ответ на JSON: `Content-Type: application/json` и тело `{"ok":true}`. Проверьте `curl -i`.

---

## 6.2 Разбираем путь и метод

`req.url` — строка вида `/api/data?limit=10`. Разобрать её удобнее классом `URL`:

```js
const url = new URL(req.url, 'http://localhost');
url.pathname;              // '/api/data'
url.searchParams.get('limit');  // '10' или null
url.searchParams.get('q');      // параметры из ?q=...
```

Первый роутер:

```js
const http = require('http');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, time: Date.now() }));
  }

  if (req.method === 'GET' && p === '/api/hello') {
    const name = url.searchParams.get('name') || 'гость';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ hello: name }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
}).listen(8090, '0.0.0.0');
```

Проверка:

```bash
curl -s http://127.0.0.1:8090/api/ping
curl -s "http://127.0.0.1:8090/api/hello?name=Аня"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/api/nope   # 404
```

> Именно такую структуру вы видите в `server.js:1097` — длинная цепочка `if` по путям. Это не «плохой код»; для сервера без зависимостей это самый прозрачный роутер.

**Задача 6.2.** Добавьте `/api/echo?q=...`, который возвращает `{"вы сказали": "..."}`. Если `q` не передан — статус 400 и сообщение об ошибке.

---

## 6.3 Читаем тело запроса (POST)

Данные из `POST` приходят **потоком** — сервер получает их кусочками (`chunk`), а не целиком. Универсальная функция чтения:

```js
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('тело слишком большое')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
```

Разбор:

1. Собираем куски в массив, считая общий размер (защита от «отправили 5 ГБ»).
2. `Buffer.concat` склеивает их в один кусок (байты).
3. `.toString()` превратит байты в строку; `JSON.parse` — в объект.

```js
const body = JSON.parse((await readBody(req)).toString() || '{}');
```

В проекте ровно эта функция живёт в `server.js:217` и передаётся всем модулям.

**Задача 6.3.** Добавьте `POST /api/echo` — принимает JSON `{text}` и возвращает его же в верхнем регистре. Проверьте:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"привет"}' http://127.0.0.1:8090/api/echo
```

---

## 6.4 Отдаём файлы сайта (статика)

Сервер должен уметь отдать `public/index.html`, `public/css/style.css` и т.д. «по запросу браузера».

Карта типов (MIME) — чтобы браузер знал, что это:

```js
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
```

Отдача файла:

```js
function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const target = path.normalize(path.join(PUBLIC_DIR, rel));

  // ЗАЩИТА ОТ PATH TRAVERSAL: нельзя выйти за пределы public/
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end('forbidden');
  }

  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(target).pipe(res);   // потоком, не в память целиком
  });
}
```

Три важные вещи:

1. **Path traversal** — атака `GET /../../etc/passwd`. Проверка `startsWith(PUBLIC_DIR)` её блокирует. Обязательно на **любом** файловом эндпоинте.
2. **`createReadStream(...).pipe(res)`** — файл уходит потоком. Так можно отдавать большие файлы (видео, музыку) без загрузки в память.
3. **`Content-Type`** — без него браузер не поймёт CSS/картинку.

**Задача 6.4.** Создайте `public/index.html`, `public/style.css`, запустите сервер и откройте `http://127.0.0.1:8090`. Убедитесь, что стили применились. Потом проверьте защиту: `curl -i --path-as-is "http://127.0.0.1:8090/../server.js"`.

---

## 6.5 Собираем всё вместе: сервер мини-канбана

Этот код проверен на практике — он реально работал и отдавал доску (см. скриншот `12-mini-kanban.png`). Сохраните как `~/my-kanban/server.js`:

```js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 8090);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

/* ---------- данные ---------- */
let db = {
  columns: [
    { id: 'c1', title: 'Задачи' },
    { id: 'c2', title: 'В работе' },
    { id: 'c3', title: 'Готово' }
  ],
  cards: []
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.cards)) db = parsed;
    }
  } catch (e) {
    console.error('db.json повреждён, использую значения по умолчанию:', e.message);
  }
}

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // атомарно: читатель никогда не увидит обрезанный JSON
}
loadDb();

function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('тело слишком большое')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/ping') return json(res, 200, { ok: true });
  if (req.method === 'GET' && p === '/api/data') return json(res, 200, db);

  if (req.method === 'POST' && p === '/api/cards') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return json(res, 400, { error: 'нужен title' });
    if (!db.columns.some(c => c.id === body.columnId)) return json(res, 400, { error: 'нет такой колонки' });
    const card = { id: uid('card_'), columnId: body.columnId, title, text: '', done: false, created: Date.now() };
    db.cards.push(card);
    saveDb();
    return json(res, 200, card);
  }

  if (req.method === 'POST' && /^\/api\/cards\/[^/]+\/toggle$/.test(p)) {
    const id = p.split('/')[3];
    const card = db.cards.find(c => c.id === id);
    if (!card) return json(res, 404, { error: 'карточка не найдена' });
    card.done = !card.done;
    saveDb();
    return json(res, 200, card);
  }

  if (req.method === 'DELETE' && /^\/api\/cards\/[^/]+$/.test(p)) {
    const id = p.split('/')[3];
    const before = db.cards.length;
    db.cards = db.cards.filter(c => c.id !== id);
    if (db.cards.length === before) return json(res, 404, { error: 'карточка не найдена' });
    saveDb();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && p === '/api/columns') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const title = String(body.title || '').trim().slice(0, 100);
    if (!title) return json(res, 400, { error: 'нужен title' });
    const column = { id: uid('col_'), title };
    db.columns.push(column);
    saveDb();
    return json(res, 200, column);
  }

  return json(res, 404, { error: 'not found' });
}

/* ---------- статика ---------- */
function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const target = path.normalize(path.join(PUBLIC_DIR, rel));
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(target).pipe(res);
  });
}

/* ---------- единый обработчик ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error('ошибка:', e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Мини-канбан запущен: http://localhost:' + PORT);
});
```

### Проверка API руками

```bash
node server.js &
curl -s http://127.0.0.1:8090/api/data
curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"Прочитать главу 6","columnId":"c1"}' http://127.0.0.1:8090/api/cards
# возьмите id из ответа и:
curl -s -X POST http://127.0.0.1:8090/api/cards/<ID>/toggle
curl -s http://127.0.0.1:8090/api/data
```

Должно работать так (пример реального запуска):

```text
{"columns":[{"id":"c1",...}],"cards":[]}
{"id":"card_mv...","columnId":"c1","title":"Прочитать главу 6","done":false,...}
{"id":"card_mv...","done":true,...}
```

**Задача 6.5.** Разберитесь, почему `/^\/api\/cards\/[^/]+\/toggle$/` — регулярное выражение именно такое. Что произойдёт с путём `/api/cards/a/b/toggle`?

<details><summary>Подсказка</summary>`[^/]+` — «один или больше символов, кроме слэша», то есть ровно один сегмент-id. Путь с лишними сегментами не совпадёт и уйдёт в 404.</details>

---

## 6.6 Обработка ошибок сервера

Главное правило: **любое исключение в обработчике не должно убивать весь процесс**. Поэтому весь код обёрнут:

```js
const server = http.createServer(async (req, res) => {
  try {
    …
  } catch (e) {
    console.error('ошибка:', e);           // полный стек — в терминал
    json(res, 500, { error: e.message });  // пользователю — суть
  }
});
```

В проекте аналогичная функция — `serverError` (`server.js:238`):

```js
function serverError(res, err, log = '') {
  if (log) console.error(log, err && (err.stack || err.message));
  json(res, 500, { error: err && err.message ? err.message : 'server error' });
}
```

> ⚠️ Никогда не отдавайте пользователю стек ошибки целиком: там пути к файлам и внутренности системы. Стек — в лог (терминал/`journalctl`), наружу — короткое сообщение.

**Задача 6.6.** Специально бросьте исключение (`throw new Error('тест')`) в одном из API-путей. Посмотрите: ответ 500, а в терминале — стек. Уберите.

---

## 6.7 Полезные штрихи, которые есть в проекте

| Приём | Зачем | Где посмотреть |
|---|---|---|
| `Content-Length` | Браузер знает размер, показывает прогресс | `server.js:1192` |
| `ETag` + `304` | Не гонять одинаковый файл дважды | `server.js:1184` |
| `Cache-Control: no-store` для API | Не кешировать свежие данные | `json()` в `server.js:233` |
| Поток `.pipe(res)` | Большие файлы, музыка, видео | `server.js:1201` |
| `fs.mkdirSync(dir, {recursive:true})` | Создать папку, если её нет | `saveDb()` |
| Ограничение размера тела | Защита от переполнения | `readBody(req, limit)` |
| Двойной сервер HTTP+HTTPS | Микрофон требует https | `server.js:1237–1284` |

**Задача 6.7.** Добавьте в свой сервер заголовок `Cache-Control` для статики (например, `no-cache`) и проверьте в DevTools → Network, что размер ответа второго визита уменьшился.

---

## 6.8 Чек-лист «Сервер готов»

- [ ] Понимаю `req`/`res`, `writeHead` и почему `end` вызывается один раз
- [ ] Умею разобрать `url.pathname` и `url.searchParams`
- [ ] Читаю тело POST-запроса и парсю JSON
- [ ] Отдаю статику с правильным `Content-Type` и знаю про path traversal
- [ ] Проверяю входные данные (400 на пустой title)
- [ ] Ловлю ошибки и не роняю сервер
- [ ] Могу проверить любой эндпоинт через `curl`

---

## ✅ Задачи главы 6 (самостоятельная работа)

1. **Hello + ping + echo** — соберите три эндпоинта из 6.1–6.3 в один сервер.
2. **Статика** — отдайте свою страницу из глав 3–4 через сервер (а не двойным кликом).
3. **CRUD колонок** — добавьте `PUT /api/columns/:id` (переименование) и `DELETE /api/columns/:id` (с карточками внутри или запретом, если не пусто — решите сами).
4. **Валидация** — верните 400, если в `POST /api/cards` пришёл `title` длиной > 200 или неизвестный `columnId`.
5. **Лог запросов** — печатайте `console.log(req.method, url.pathname, Date.now())` для каждого запроса. Убедитесь, что при открытии страницы видно, как браузер грузит html/css/js/api.
6. **Разбор проекта.** В `server.js` найдите конец файла (`server.js:1218`) и объясните своими словами: чем отличается работа при наличии `ssl/` (HTTPS) и без него.

**Приёмка:** сервер из п.1–5 запускается, отдаёт страницу и API, вы прошли по всем путям через `curl`, страница открывается в браузере.

**Дальше → [Глава 7. Хранение данных](07-dannye.md)**
