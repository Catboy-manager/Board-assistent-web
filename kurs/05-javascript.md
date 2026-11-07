# Глава 5. JavaScript

> **Цель главы:** освоить ровно столько JavaScript, сколько нужно, чтобы написать доску: переменные, функции, массивы/объекты, события, `fetch` и асинхронность. Это самая объёмная глава — но каждый раздел сразу применяется к реальному коду проекта.

---

## 5.1 Переменные и типы

```js
let count = 0;              // изменяемая
const name = 'NeuroBoard';  // не переприсваивается (но объект можно мутировать!)
let total = 5 + 3.5;        // number (один тип и для целых, и для дробных)
let ok = true;              // boolean
let nothing = null;         // «намеренно пусто»
let undef;                  // «значения нет»
```

Почему `const` по умолчанию: он защищает от случайного переприсваивания. `let` — когда значение будет меняться (счётчики, индексы).

Строки:

```js
const title = 'Купить молоко';
const line = title + ' завтра';          // конкатенация
const line2 = `${title} — ${2 + 2}`;     // шаблонная строка (серьги ``)
const upper = title.toUpperCase();
const part = title.slice(0, 5);
const has = title.includes('молоко');    // true
const words = 'a b c'.split(' ');        // ['a','b','c']
```

Булевы значения и сравнения:

```js
const isSoon = diff > 0 && diff < 86400000;   // «и», оба условия
const isEmpty = !list.length;                 // «не»
if (title) { /* непустая строка — здесь catch! */ }
```

> ⚠️ Сравнение с `==` считается вредным (`'1' == 1` → `true`). Используйте всегда `===` и `!==`.

### Ошибки, которые ловят всех

```js
undefined.x        // TypeError: cannot read properties of undefined
consol.log(1)      // ReferenceError: consol is not defined
```

Защита — «оператор длинной цепочки»:

```js
const color = card && card.color ? card.color : '#888';  // классика
const color2 = card?.color ?? '#888';                     // современный синтаксис
```

В проекте повсюду встречается ещё более скромный вариант — `try { ... } catch (e) {}` вокруг всего, что может сломаться (сеть, localStorage, чужая панель).

**Задача 5.1.** В `node -e` или в консоли браузера: выведите длину строки, сделайте её заглавной, проверьте `includes` на подстроке.

---

## 5.2 Функции

```js
function greet(name) {
  return 'Привет, ' + name;
}
greet('Аня');                       // 'Привет, Аня'

const sum = (a, b) => a + b;        // стрелочная, короткая запись
const show = () => console.log('ок'); // без аргументов
```

Функция — «именованный рецепт». Главное правило: **одна функция — одна задача**, имя с глаголом (`render`, `load`, `save`, `addCard`).

В проекте есть особый стиль — **методы объекта**:

```js
window.APP = {
  db: null,
  async init() { this.db = await this.fetchData(); this.render(); },
  render() { /* … */ },
  save() { /* … */ }
};
```

Здесь `this` — это сам объект `APP`. Вызывайте `APP.render()`, а не `render()` — иначе `this` потеряется.

И ещё один проектный приём — **фабрика модулей** (глава 10):

```js
module.exports = (deps) => {
  const { dataDir, json } = deps;   // «получил инструменты от сервера»
  return { handle(p, url, req, res) { /* … */ } };
};
```

**Задача 5.2.** Напишите функцию `plural(n, one, few, many)`, которая вернёт `'5 карточек'`, `'1 карточка'`, `'2 карточки'` (русская склоняющая арифметика: `n % 10 === 1 && n % 100 !== 11` и т.д.).

---

## 5.3 Массивы и объекты — рабочая лошадка

Объект:

```js
const card = { id: 'c1', title: 'Купить', done: false };
card.title;              // читаем
card.done = true;        // меняем
card.due = '';           // добавляем новое поле
delete card.due;         // удаляем
'key' in card;           // проверка наличия
Object.keys(card);       // ['id','title','done']
```

Массив:

```js
const cards = [card, { id: 'c2', title: 'Позвонить', done: true }];
cards.length;            // 2
cards.push(newCard);     // добавить в конец
cards[0];                // первый
cards.slice();           // КОПИЯ (важно для сортировок и UI!)
```

### Методы, без которых не обойтись

```js
const cards = db.board.cards;

cards.filter(c => c.columnId === col.id);   // отбор: все карточки колонки
cards.find(c => c.id === id);               // первая подходящая
cards.some(c => c.title === 'x');           // есть ли хотя бы одна
cards.every(c => c.done);                   // все ли выполнены
cards.map(c => c.title);                    // превращение: ['а','б']
cards.sort((a, b) => b.created - a.created);// сортировка (не мутирует исходный? — нет, мутирует!)
cards.forEach(c => console.log(c));         // пройтись и сделать
```

Сортировка мутирует массив! В проекте поэтому пишут `list.slice().sort(...)` (`app.js:446`) — сортируют копию, чтобы не перепутать порядок в данных.

Группировка — частая задача, и решается она за одну строку:

```js
const byColumn = {};
for (const c of cards) (byColumn[c.columnId] ||= []).push(c);
// { c1: [...], c2: [...] }
```

А в `render()` доски делают проще и понятнее — фильтр в цикле:

```js
columns.forEach(col => {
  const colCards = cards.filter(c => c.columnId === col.id);
  // …нарисовать колонку с colCards
});
```

### Деструктуризация и spread

```js
const { columns, cards } = db.board;        // разложили объект
const copy = { ...card, done: true };       // копия + правка
const rest = cards.filter(c => c.id !== id);
const newList = [...rest, newCard];         // новый массив из кусков
```

**Задача 5.3.** Дан массив карточек. Напишите одной строкой: количество выполненных, список названий невыполненных, и самую новую карточку (по `created`).

```js
const cards = [
  { id: 'c1', title: 'A', done: true,  created: 100 },
  { id: 'c2', title: 'B', done: false, created: 300 },
  { id: 'c3', title: 'C', done: false, created: 200 }
];
```

---

## 5.4 События: как страница реагирует

```js
btn.addEventListener('click', (e) => { … });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
head.addEventListener('pointerdown', startDrag);
document.addEventListener('wheel', onWheel, { passive: false });
```

Важные свойства события `e`:

- `e.target` — на что **конкретно** кликнули (может быть дочерний элемент!).
- `e.currentTarget` — куда навешан обработчик.
- `e.preventDefault()` — отменить стандартное поведение (открытие ссылки, прокрутку).
- `e.stopPropagation()` — не всплывать выше (часто: `e.stopPropagation()` в кнопке внутри карточки, чтобы карточка не открылась).
- `e.clientX/Y` — координаты курсора (для drag&drop и зума).

**Делегирование** — приём, когда обработчик вешается на родителя и определяет «жертву» через `closest`:

```js
list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ev-del]');
  if (!btn) return;
  removeEvent(btn.dataset.evDel);
});
```

Удобно для списков, которые перестраиваются (`app.js:457` — так удалены события).

**Pointer-события** (`pointerdown/move/up`) — современная замена мышь+тач. Проект использует их для перетаскивания колонок и панелей (`app.js:287`), потому что они работают и на телефоне.

**Задача 5.4.** Навесьте на элемент списка `click`, а на кнопку внутри — `click` с `e.stopPropagation()`. Убедитесь, что клик по кнопке не «всплывает» к списку.

---

## 5.5 Асинхронность: промисы и async/await

Сетевой запрос нельзя выполнить «синхронно» — он занял бы время. Поэтому есть три поколения:

```js
// 1. Колбэки (старый стиль)
fs.readFile(file, (err, buf) => { … });

// 2. Промисы
fetch('/api/data').then(r => r.json()).then(db => render(db));

// 3. async/await (читается как обычный код)
async function load() {
  const res = await fetch('/api/data');
  const db = await res.json();
  render(db);
}
```

Правила:

- `await` можно использовать **только внутри `async`-функции**.
- `await` «замораживает» только эту функцию, не весь сервер/страницу.
- Ошибка (сеть, парсинг) вылезает как исключение — ловится `try/catch`.

Таймауты и «промисы-обёртки»:

```js
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(900);   // подождать 0.9 с (проект так ждёт ответ поиска постера)
```

Параллельно vs последовательно:

```js
await Promise.all(files.map(f => load(f)));      // всё сразу (быстро)
for (const m of need) { await fetch(…); await wait(1200); }  // по очереди (бережно, для API)
```

**Задача 5.5.** Объясните, чем `await Promise.all([...])` отличается от цикла с `await` внутри, и когда что уместно (подсказка: API с лимитами запросов).

---

## 5.6 fetch: разговор с сервером

```js
// GET
const res = await fetch('/api/data');
if (!res.ok) throw new Error('HTTP ' + res.status);
const db = await res.json();

// POST с JSON
await fetch('/api/cards', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Купить хлеб' })
});

// DELETE
await fetch('/api/cards/' + encodeURIComponent(id), { method: 'DELETE' });
```

Чек-лист ошибок:

- `res.ok` — `true` для 200–299. **Проверять обязательно.**
- `.json()` бросит исключение, если тело — мусор.
- `encodeURIComponent(id)` — если в пути может быть спецсимвол.
- CORS — «другой домен может запретить запрос» (в курсе не встретится, потому что сервер и страница — один хост).

Из реального кода (`public/js/movies.js:27`):

```js
async function load() {
  try {
    const r = await fetch('/api/movies');
    if (r.ok) { list = ((await r.json()).movies) || []; list = shuffle(list); }
  } catch (e) { list = list || []; }
  render();
}
```

Обратите внимание: **ошибка не кидает страницу в панику** — есть фолбэк на пустой список, и рендер всё равно происходит. Это стиль всего проекта: «мягкая деградация».

**Задача 5.6.** Сделайте функцию `loadJson(url)` с обработкой ошибок и таймаутом 5 с (`AbortController`).

---

## 5.7 Хранилище браузера (localStorage)

```js
localStorage.setItem('kban-cols', JSON.stringify(map));
const pos = JSON.parse(localStorage.getItem('kban-cols') || '{}');
localStorage.removeItem('kban-cols');
```

- Только строки — объекты через `JSON.stringify/parse`.
- Живёт на **этом устройстве и браузере**, не синхронизируется.
- Отлично для: позиций колонок, масштаба UI, «гайд уже показывали», темы.

В проекте: позиции колонок (`kban-cols`), зум (`kban-view`), ключ умного дома (`kban-smart-key`), флаг первого показа справки (`kanbanGuideSeen`).

> ⚠️ `localStorage` — **не** хранилище данных доски! Источник истины — `data/db.json` на сервере. localStorage — только «удобства» конкретного браузера.

---

## 5.8 Разбор реального кода: три фрагмента, которые стоит понять

### 1. Загрузка и сохранение (`public/js/app.js:40`)

```js
async fetchData() {
  try {
    const res = await fetch('/api/data');
    return await res.json();
  } catch (e) { return this.fallbackDb(); }   // сервер недоступен? дадим пустую доску
},
async save() {
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.db)
    });
    const r = await res.json().catch(() => null);
    if (r && r.db) { this.db = r.db; this.render(); }  // сервер — источник истины!
  } catch (e) { console.error('save fail', e); }
}
```

Ключевая идея: **сервер отвечает «чем стала доска» (`r.db`), и клиент подставляет её обратно**. Так синхронизируются вкладки и устройства.

### 2. Напоминания: проверка каждые 20 секунд (`app.js:498`)

```js
checkEvents() {
  const now = Date.now();
  let changed = false;
  this.db.events.forEach(ev => {
    if (!ev.notified && new Date(ev.when).getTime() <= now) {
      ev.notified = true;                 // пометили, чтобы не повторить
      changed = true;
      this.notifySystem(ev.title, ev.note || 'Наступило время события');
      this.toast(ev.title, ev.note, true);
    }
  });
  if (changed) this.save();               // сохранили только если что-то поменялось
}
```

Заметьте аккуратность: флаг `notified` не даёт слать уведомление вечно, а `changed` экономит запись на диск.

### 3. Палитра из картинки (`app.js:131`) — «прожорливый», но показательный код

```js
const cv = document.createElement('canvas');
cv.width = 48; cv.height = 48;                    // уменьшаем картинку
const g = cv.getContext('2d');
g.drawImage(img, 0, 0, 48, 48);
const d = g.getImageData(0, 0, 48, 48).data;      // массив пикселей
// …бинаризуем цвета, считаем частоты, выбираем доминантный…
res({ dominant: best, luma: avgLuma });
```

Из этого цвета считывается **акцент интерфейса** (см. 4.5). Это пример того, что «JavaScript в браузере может не только кнопки нажимать», а обрабатывать графику.

---

## 5.9 Чек-лист «JS готов»

- [ ] `const/let`, `===`, шаблонные строки, `?.` и `??`
- [ ] Функции, включая стрелочные и методы объекта
- [ ] `filter/find/map/some/sort` + понимание, что `sort` мутирует
- [ ] Деструктуризация и spread
- [ ] События: `e.target`, `stopPropagation`, делегирование
- [ ] `async/await` + `try/catch`
- [ ] `fetch`: GET/POST, проверка `res.ok`
- [ ] Понимаю разницу `localStorage` и серверной базы

---

## ✅ Задачи главы 5 (самостоятельная работа)

1. **`plural()`** — из 5.2, с тестами в консоли (1, 2, 5, 11, 21 карточка).
2. **Группировка.** По массиву карточек постройте объект `{ c1: n1, c2: n2 }` (сколько карточек в колонке).
3. **Свой fetch.** Напишите `async function api(path, opts)` — обёртку над `fetch` для `/api/...`, которая кидает понятную ошибку при не-200 и парсит JSON.
4. **События.** Сделайте поле ввода + список: Enter добавляет, клик по пункту перечёркивает (класс `done`), двойной клик удаляет.
5. **Разбор.** Возьмите `checkEvents()` из проекта и перепишите его для массива `cards` с полем `due`: когда срок проходит — карточка получает класс `overdue` и уведомление.
6. **Тест на понимание.** Объясните вслух, почему `const list = [...].sort(...)` опасен и что делает `slice()`.

**Приёмка:** страница из задания 4 продолжает работать, но теперь добавление/удаление/перекидывание работают через события, а список умеет перестраиваться из массива данных.

**Дальше → [Глава 6. Сервер на Node.js](06-server.md)**
