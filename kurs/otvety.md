# Ответы и подсказки к задачам

> Здесь — **не единственно верные**, а рабочие решения. Ваш код может отличаться: важна работающая идея. Перед чтением ответа честно попробуйте сами.

---

## Глава 1. Как всё устроено

**1.1–1.5** (обзорные). Ключевые факты для самопроверки:

- Проект — это **Node.js без фреймворков**: роутер, статика и API написаны вручную.
- Данные — JSON-файлы в `data/` (`db.json` — доска, `smart.json` — умный дом и т.д.).
- Браузер при открытии `index.html` шлёт `GET /api/data`, получает JSON, JS строит DOM; изменения уходят назад через `PUT /api/data`.
- Три репозитория: web (`kanban-board`) — источник истины, linux/windows — Electron-обёртки. Общий веб-код синхронизируется, `server.js` в десктопах отличается путями (`DATA_DIR` в домашней папке пользователя).
- Сервис `kanban-board` работает под systemd, порты 8080/8443.

---

## Глава 2. Окружение

**2.1** Проверка:

```bash
node -v        # v18+ (в проекте v22)
npm -v
git --version
curl --version
```

Если Node старый — через nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash` затем `nvm install 22`.

**2.2** DevTools → `F12` (или Ctrl+Shift+I). Вкладки: **Elements** (DOM/CSS), **Console** (ошибки и `console.log`), **Sources** (точки останова), **Network** (запросы).

**2.3** `curl` — «браузер в терминале»:

```bash
curl -s http://localhost:8080/api/ping
curl -s -i http://localhost:8080/ | head -5      # -i показывает заголовки
```

**2.4** Первый сервер и клиент — см. главу 6; проверка: `curl http://localhost:8090/api/ping` → `{"ok":true}`.

---

## Глава 3. HTML

**3.1** Каркас:

```html
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Доска</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
  <header><h1>Моя доска</h1></header>
  <main id="board"></main>
  <div id="modal" class="hidden"></div>
  <div id="toasts"></div>
  <script src="/js/app.js"></script>
</body>
</html>
```

**3.2** Форма:

```html
<form>
  <input type="text" name="title" placeholder="Заголовок" required>
  <textarea name="text"></textarea>
  <select name="priority"><option value="">—</option><option>high</option></select>
  <button type="submit">Создать</button>
</form>
```

`required` — встроенная проверка (пустое не отправится).

**3.3** Семантика: `header/main/section/article/nav/button` вместо «дивов на всё». Плюсы: доступность (скринридеры), SEO, понятность кода.

**3.4** Кнопка-иконка:

```html
<button class="icon-btn" aria-label="Настройки" title="Настройки">⚙️</button>
```

**3.5** `esc()` (обязательно запомнить):

```js
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
```

---

## Глава 4. CSS

**4.1** Тёмная тема через переменные:

```css
:root{
  --bg:#0e1116; --panel:#161b22; --card:#1c2230;
  --text:#e6edf3; --muted:#8b98a9; --accent:#4c8bf5; --border:#2a3140;
}
body{ background:var(--bg); color:var(--text); margin:0;
      font:15px/1.5 system-ui, sans-serif; }
```

**4.2** Колонки flex:

```css
#board{ display:flex; gap:16px; padding:16px; align-items:flex-start; overflow-x:auto; }
.column{ flex:0 0 300px; background:var(--panel); border-radius:12px; padding:10px; }
```

**4.3** Стеклянная карточка:

```css
.card{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  backdrop-filter:blur(6px); border-radius:10px; padding:10px;
  box-shadow:0 4px 14px rgba(0,0,0,.35); cursor:grab; }
.card:hover{ background:rgba(255,255,255,.1); }
```

**4.4** Адаптив:

```css
@media (max-width:640px){
  #board{ flex-direction:column; }
  .column{ flex:1 1 auto; width:100%; }
}
```

**4.5** `box-sizing`: глобально `*,*::before,*::after{ box-sizing:border-box }` — ширина/паддинг считаются предсказуемо.

---

## Глава 5. JavaScript

**5.1** Типы и разница `==`/`===`:

```js
console.log('5' == 5);    // true  (приведение типов)
console.log('5' === 5);   // false (разные типы) ← всегда используйте ===
```

**5.2** Функции:

```js
function greet(name){ return 'Привет, ' + name; }
const greet2 = (name='друг') => `Привет, ${name}`;
```

**5.3** Массив: фильтр/сумма:

```js
const cards = [{title:'a',done:false},{title:'b',done:true}];
const done = cards.filter(c => c.done);
const titles = cards.map(c => c.title).join(', ');
```

**5.4** Состояние + рендер:

```js
const state = { items: ['A','B'] };
const $ = id => document.getElementById(id);

function render(){
  $('list').innerHTML = state.items
    .map((t,i) => `<li>${esc(t)} <button data-del="${i}">✕</button></li>`).join('');
  document.querySelectorAll('[data-del]').forEach(b =>
    b.onclick = () => { state.items.splice(+b.dataset.del,1); render(); });
}
```

**5.5** `localStorage`:

```js
const save = () => localStorage.setItem('demo', JSON.stringify(state));
const load = () => { try{ Object.assign(state, JSON.parse(localStorage.getItem('demo')||'{}')); }catch(e){} };
```

**5.6** `fetch`:

```js
async function api(path, opts){
  const r = await fetch(path, opts);
  if(!r.ok) throw new Error(r.status + ' ' + r.statusText);
  return r.json();
}
```

**5.7** Даты/события (см. главу 8, `checkEvents`): сравнение `Date.now()` с `due` каждые 20 с.

---

## Глава 6. Сервер

**6.1** Мини-сервер:

```js
const http = require('http');
const server = http.createServer((req,res) => {
  if(req.url === '/api/ping'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end('{"ok":true}'); return; }
  res.writeHead(404); res.end('нет');
});
server.listen(8090, '127.0.0.1', () => console.log('http://127.0.0.1:8090'));
```

**6.2** `json()` и `serverError()`:

```js
const json = (res, code, obj) => { res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(obj)); return true; };
function serverError(res, e){ console.error(e); json(res, 500, { error: 'Внутренняя ошибка' }); return true; }
```

**6.3** `readBody` с лимитом:

```js
function readBody(req, limit = 5*1024*1024){
  return new Promise((resolve,reject) => {
    let n=0; const chunks=[];
    req.on('data', c => { n+=c.length; if(n>limit){ reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
```

**6.4** Роутер (разбор `p` + `url` через `new URL`):

```js
const u = new URL(req.url, 'http://' + (req.headers.host||'localhost'));
const p = u.pathname;
```

**6.5** Атомарная запись:

```js
function saveDb(){ fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(TMP, JSON.stringify(db,null,2)); fs.renameSync(TMP, FILE); }
```

**6.6** Порядок веток роутера важен: **API → конкретные файлы → статика → 404.** Иначе статика перехватит `/api/...`.

---

## Глава 7. Данные

**7.1** `db.json`:

```json
{ "board": { "columns": [{"id":"todo","title":"Надо","color":"#4c8bf5"}], "cards": [] },
  "events": [], "settings": {} }
```

**7.2** Защищённое чтение:

```js
function loadJson(file, def){ try{ return JSON.parse(fs.readFileSync(file,'utf8')); }catch(e){ return def; } }
```

**7.3** `mergeSave` (сервер не теряет поля, которых нет у клиента): слить по ключам верхнего уровня, глубоко — только известные разделы (`board`, `events`), служебные `_ai*` оставить серверными.

**7.4** Схема. Заведите «контракт»: `column = {id,title,color}`, `card = {id,columnId,title,text,priority,due,done}`. Любой код (и сервер, и клиент) обязан следовать.

**7.5** Бэкап:

```bash
mv data/db.json "data/db-$(date +%F).json.bak"
```

**7.6** Миграция: при чтении, если нет `settings.clock`, добавить дефолт и сохранить.

---

## Глава 8. Фронтенд канбана

**8.1** Упрощённый `render`: не читать `colPos`, всегда `ax/ay` сеткой.

**8.2** Доп. поле «исполнитель»: добавить `assignee` в схему карточки, поле в модалке (`#m-card-assignee`), чип в `makeCard`, `updated.assignee = …`. Проверьте `data/db.json` после сохранения.

**8.3** Drag&drop (см. 8.6): `draggable`, `dragstart` → `setData(id)`, `dragover` → `preventDefault`, `drop` → `find` + смена `columnId` + `save/render`.

**8.4** Колонки: `pointerdown/move/up` + `setPointerCapture` + `localStorage['kban-cols']`.

**8.5** Зум:

```js
let z = 1;
document.addEventListener('wheel', e => {
  if(!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  z = Math.max(0.15, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.9)));
  document.documentElement.style.zoom = z;
}, { passive:false });
```

**8.6** `initResizer`: тянем правую ИИ-панель. Деление на `CANVAS.scale()` — потому что ширина панели считается в layout, а курсор даёт визуальные координаты; `Math.min(…, 640)` — верхняя граница ширины, чтобы панель не заняла весь экран.

---

## Глава 9. Реальное время

**9.1** SSE-часики:

```js
// сервер
if(p === '/api/tick'){ res.writeHead(200,{'Content-Type':'text/event-stream'});
  const t = setInterval(()=>res.write('data: '+JSON.stringify({t:Date.now()})+'\n\n'),2000);
  req.on('close',()=>clearInterval(t)); return true; }
// клиент
const es = new EventSource('/api/tick');
es.onmessage = e => document.getElementById('clk').textContent = new Date(JSON.parse(e.data).t).toLocaleTimeString();
```

**9.2** Живая доска: сервер при `PUT /api/data` шлёт `data: {"type":"board"}\n\n`; клиент по событию зовёт `fetchData(); render();`.

**9.3** Приём с телефона — глава 9.4–9.6.

**9.4** Дедуп + приватность:

```js
function blocked(x){ return /пароль/i.test(x.title + ' ' + x.text); }
```

**9.5** Звук:

```js
const a = document.getElementById('notif-sound');
a.src = it.app === 'Telegram' ? '/sounds/message.mp3' : '/sounds/notify.mp3';
a.play().catch(()=>{});
```

**9.6** Диагностика: на один SSE-клиент в `ss` видно ~2 строки (обе стороны), на два — ~4. Плюс обычные запросы. Если долгих потоков 6 — новые запросы «виснут».

---

## Глава 10. Модули

**10.1** `notes.js` — по образцу 10.2: `store={items:[]}`, `GET/POST /api/notes`, `return false` в конце.

**10.2** Подключение: `const notes = require('./notes')({dataDir:DATA_DIR,readBody,json});` + `if(p.startsWith('/api/notes')){ if(await notes.handle(p,url,req,res)) return; }`.

**10.3** Клиент: IIFE + `window.NOTES`, `DOMContentLoaded → load()`.

**10.4** «Привычки» — полный код в 10.6; главное: свои данные, свой модуль, своя панель, `esc`, стрик.

**10.5** В `movies.js`: `handle` возвращает `false` для чужих путей; файл читается/пишется в `data/movies.json`; постер ищется через Bing Images, при неудаче — ИИ-резолвер.

**10.6** Рефакторинг — критерий: `server.js` вырос на 2 строки (`require` + роут).

---

## Глава 11. Итоговый проект

**11.1** `test.sh`:

```bash
#!/usr/bin/env bash
set -e
B=http://localhost:8090
curl -sf $B/api/ping >/dev/null && echo "ping ok"
test "$(curl -s -o /dev/null -w '%{http_code}' $B/)" = 200 && echo "index ok"
test "$(curl -s -o /dev/null -w '%{http_code}' $B/api/nope)" = 404 && echo "404 ok"
test "$(curl -s -o /dev/null -w '%{http_code}' --path-as-is $B/../server.js)" = 403 && echo "traversal ok"
```

**11.2** Правила проекта — см. `AGENTS.md` этого репозитория как образец.

---

## Глава 12. Безопасность

**12.1** `host = process.env.KANBAN_HOST || '127.0.0.1'`; для LAN — `KANBAN_HOST=0.0.0.0`, но без проброса порта на роутере.

**12.2** Ключ:

```js
const KEY = process.env.KANBAN_NOTIFY_KEY || (config.notify||{}).key || '';
function ok(req,u){ return !KEY || (req.headers['x-kb-key']||u.searchParams.get('key')) === KEY; }
```

**12.3** Аудит: `git log -p | grep -i "token\|secret\|password"`. Нашли — смените секрет; историю чистите `git filter-repo` или создайте репозиторий заново.

**12.4** Path traversal — код в 12.5. Проверка даёт `403/404`.

**12.5** XSS: заменить все вставки на `esc(...)`. Тест: заголовок `<b>x</b>` показывается как текст.

**12.6** HTTPS: `openssl req -x509 …` → `https.createServer({key,cert}, handle).listen(8443)`.

**12.7** systemd — юнит в 12.8; `kill` процесса → systemd поднимет через `RestartSec`.

---

## Глава 13. ИИ и умный дом

**13.1** ИИ-эхо:

```js
if(p === '/api/ai/echo' && req.method === 'POST'){
  const b = JSON.parse((await readBody(req)).toString()||'{}');
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const child = spawn('opencode',['run','-m','opencode/big-pickle','--format','json']);
  child.stdout.on('data',d=>res.write('data: '+JSON.stringify({delta:String(d)})+'\n\n'));
  child.on('close',()=>{ res.write('data: {"done":true}\n\n'); res.end(); });
  child.stdin.end(String(b.prompt||''));
  return true;
}
```

**13.2** CLI:

```js
const B = process.env.KANBAN_URL || 'http://localhost:8090';
const [,, cmd, ...rest] = process.argv;
if(cmd === 'add') fetch(B+'/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({title:rest.join(' '),columnId:'todo'})}).then(()=>console.log('ok'));
```

**13.3** Мини-умный дом: опрос → сравнить со прошлым (`prev` в памяти) → при изменении `emit` в SSE → сцена. Защита от петли: `busyScenes = new Set()` (только память!) + cooldown.

**13.4** Адаптер: `{ poll(){ return newState; }, cmd(action){ … } }`; фича не знает деталей.

**13.5** Скан:

```js
const { execFile } = require('child_process');
function ping(ip){ return new Promise(r => execFile('ping',['-c','1','-W','1',ip],e => r(!e))); }
// 192.168.1.1..254 параллельно, собрать ответивших
```

**13.6** Интеграция — отдельным модулем по рецепту главы 10.

---

## Что дальше

Если все задачи сделаны — вернитесь к [главе 11](11-itogovyy-proekt.md) и добавьте 2–3 фичи из «дополнительных задач», затем к [13.9](13-sleduyushchie-shagi.md) и выберите следующую тему обучения.

**Оглавление → [README](README.md)**
