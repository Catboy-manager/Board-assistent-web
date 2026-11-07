# Глава 3. HTML и DOM

> **Цель главы:** научиться описывать страницу и понимать, как браузер превращает текст разметки в дерево элементов, с которым потом работает JavaScript.

---

## 3.1 Что такое HTML

**HTML** (HyperText Markup Language) — не программа, а **описание структуры**: «здесь заголовок, здесь абзац, здесь кнопка, а это поле для ввода». Браузер читает такой текст и строит из него страницу.

Базовый скелет:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Моя доска</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <h1>Мои задачи</h1>
  <p>Привет, мир!</p>
  <script src="/js/app.js"></script>
</body>
</html>
```

- `<!DOCTYPE html>` — «это современный HTML5» (иначе браузер может рисовать как в 2005-м).
- `<head>` — служебное: кодировка, заголовок вкладки, подключённые стили/скрипты. Пользователь этого «не видит».
- `<body>` — то, что видно на экране.
- `<meta name="viewport">` — **обязательно для телефона**: без него страница будет выглядеть как уменьшенная десктопная.

### Теги, атрибуты, вложенность

```html
<a href="https://example.com" title="Открыть">Ссылка</a>
<input type="text" id="new-card" placeholder="Название задачи">
<button class="btn primary" disabled>Сохранить</button>
```

- **Тег** — `<button>` … `</button>` (пустые: `<img>`, `<input>`, `<br>` — закрывающий слэш не нужен).
- **Атрибут** — `href`, `id`, `class`, `type`, `disabled`.
- **Вложенность** — теги складываются как матрёшки; порядок закрывающих тегов обязан совпадать.

### Полезные теги, которые встретятся в проекте

| Тег | Назначение | Где в NeuroBoard |
|---|---|---|
| `<header>`, `<nav>`, `<main>`, `<aside>`, `<section>` | Смысловые «куски» страницы | `index.html:23–205` |
| `<button>` | Кнопка (всегда `<button>`, не `<div>`!) | повсюду |
| `<input type="text\|datetime-local\|color\|range\|file">` | Поля ввода | модалки карточек |
| `<textarea>` | Многострочный текст | описание карточки |
| `<select>` / `<option>` | Выпадающий список | выбор колонки |
| `<img loading="lazy">` | Картинка | постеры фильмов |
| `<audio>` | Плеер | `<audio id="notif-sound">` (`index.html:278`) |
| `<template>`, `hidden` | Служебное/скрытое | — |

### Семантика — зачем она нужна

`<div>` — «просто коробка». `<section>` — «блок содержимого», `<button>` — «это нажимают». Семантика даёт: доступность (скриншоты-ридеры понимают), удобство поиска в коде, стилизацию «по умолчанию». Правило: **если это кликабельно — это `<button>`**.

**Задача 3.1.** Создайте `~/my-kanban/public/index.html` со страницей-визиткой: заголовок, абзац, список из трёх навыков, которые вы хотите получить, и ссылка на `https://nodejs.org`. Откройте файл двойным кликом в браузере.

---

## 3.2 Элементы, которые умеют «делать что-то»

```html
<form id="add-form">
  <label for="title">Название задачи</label>
  <input id="title" name="title" type="text" placeholder="Купить молоко" required>
  <select id="column">
    <option value="c1">Задачи</option>
    <option value="c3">Готово</option>
  </select>
  <button type="submit">Добавить</button>
</form>
```

Ключевые атрибуты:

- `id` — уникальный «ярлык» элемента (для `getElementById`).
- `class` — «родовая принадлежность» для стилей (у элемента может быть несколько: `class="btn primary"`).
- `name` — имя поля при отправке формы.
- `data-*` — **ваши собственные атрибуты** для хранения данных прямо в разметке: `data-col="c1"`. В проекте используется массово: `data-view`, `data-card`, `data-close`.

**Задача 3.2.** Добавьте в свою страницу форму с полем, списком и кнопкой. Проверьте в DevTools (F12 → Elements), что атрибуты на месте.

---

## 3.3 DOM: как браузер это хранит

Браузер разбирает HTML и строит **дерево** — Document Object Model. Каждый тег — объект со свойствами (`id`, `className`, `textContent`) и методами (`appendChild`, `addEventListener`).

```text
document
└── html
    ├── head
    └── body
        ├── h1 "Мои задачи"
        ├── ul
        │   ├── li "Купить молоко"
        │   └── li "Позвонить врачу"
        └── script
```

### Два способа строить DOM

**1. `innerHTML` — вставить кусок разметки строкой** (быстро, удобно, но опасно при пользовательском тексте):

```js
const box = document.getElementById('list');
box.innerHTML = '<li class="item">Купить молоко</li>';
```

**2. `createElement` — создавать элементы по отдельности** (безопасно, гибко):

```js
const li = document.createElement('li');
li.className = 'item';
li.textContent = card.title;   // текст вставляется БЕЗ разметки — это защита
box.appendChild(li);
```

> ⚠️ **Экранирование — обязательный навык.** Если пользователь напишет в карточке `<img src=x onerror=alert(1)>`, то при вставке через `innerHTML` этот код **выполнится** (XSS). Поэтому в проекте есть функция-фильтр, которую вы встретите в каждом клиентском файле:
>
> ```js
> const esc = s => String(s == null ? '' : s)
>   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
> // использование: `<div class="title">${esc(card.title)}</div>`
> ```
> (`public/js/app.js`, `public/js/movies.js`, `public/js/notify.js` — одна и та же функция.)

### Как искать элементы

```js
document.getElementById('clock');            // по id — быстрее всего
document.querySelector('.column');           // первый подходящий по селектору
document.querySelectorAll('.card');          // ВСЕ подходящие → NodeList
document.querySelector('[data-col="c1"]');   // по атрибуту
```

**Задача 3.3.** В консоли DevTools на своей странице выполните:

```js
document.querySelectorAll('li').length        // сколько элементов
document.querySelector('h1').textContent      // текст заголовка
document.body.innerHTML = document.body.innerHTML  // не делайте так в жизни :) просто сравните
```

---

## 3.4 Разбор реального `index.html`

Главная страница NeuroBoard (`public/index.html`) — 309 строк. Вот её «скелет»:

```html
<body data-view="dash">                     <!-- какая вкладка открыта: dash / board / cookies -->
  <div id="bg"></div>                       <!-- фон, который меняется в настройках -->

  <header id="topbar">…</header>            <!-- логотип, часы, переключатель вкладок, погода, ⚙️ -->

  <div id="dash-view">                      <!-- ВКЛАДКА «Дашборд» -->
    <main id="dash">
      <section class="dash-card" data-card="tasks">…</section>   <!-- ✅ задачи -->
      <section class="dash-card" data-card="ai">…</section>      <!-- 🤖 чат -->
      <section class="dash-card" data-card="movies">…</section>  <!-- 🎬 -->
      <section class="dash-card" data-card="news">…</section>    <!-- 🗞 -->
      …
      <section class="side-panel" id="smart-panel">…</section>   <!-- 🏠 умный дом -->
    </main>
    <aside id="notif-col">…</aside>         <!-- колонка уведомлений справа -->
  </div>

  <div id="world">                          <!-- ВКЛАДКА «Канбан» — большая «доска» -->
    <main id="board"><div id="board-inner"></div></main>
  </div>

  <div id="modal" class="modal hidden"></div>   <!-- подложка модальных окон -->
  <audio id="notif-sound" preload="auto"></audio>

  <script src="/js/app.js?v=3"></script>    <!-- ядро первым -->
  <script src="/js/canvas.js?v=1"></script>  <!-- потом остальные -->
  …
</body>
```

Обратите внимание на приёмы, которые стоит украсть:

1. **`data-view="dash"` на `<body>`** — одна строка состояния, по которой CSS показывает/прячет вкладки (`#dash-view`, `#world`). JS меняет атрибут → переключается весь интерфейс.
2. **`hidden` и `.hidden`** — элементы есть в разметке, но скрыты; JS просто снимает класс. Не надо пересоздавать DOM каждый раз.
3. **`?v=3` в адресе скрипта** — «кешбастер»: поменяли код → поставили `?v=4` → браузер гарантированно возьмёт свежий файл.
4. **Порядок `<script>`** — в конце `<body>`, чтобы DOM уже существовал, когда выполняется код.

**Задача 3.4.** Откройте `index.html` реального проекта в редакторе и подсветьте (хотя бы мысленно) 5 разных тегов из таблицы раздела 3.1. Запишите, какой из них отвечает за «Что именно рисуется в шапке».

---

## 3.5 Разбор рендера карточки в `app.js`

Так в проекте превращается объект данных в элемент страницы (`public/js/app.js:322`):

```js
makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.card = card.id;          // data-card="card_x1" — для поиска в DOM
  el.draggable = true;                // разрешаем HTML5-перетаскивание

  let html = '';
  if (card.title) html += `<div class="card-title">${this.esc(card.title)}</div>`;
  if (card.text)  html += `<div class="card-text">${this.esc(card.text)}</div>`;

  let meta = '';
  if (card.due) {                     // чип с датой напоминания
    const diff = new Date(card.due) - Date.now();
    const soon = diff > 0 && diff < 86400000;
    meta += `<span class="chip due${soon ? ' soon' : ''}">📅 …</span>`;
  }
  if (meta) html += `<div class="card-meta">${meta}</div>`;
  el.innerHTML = html;

  el.onclick = (ev) => { if (!el.classList.contains('dragging')) this.openEditCard(card); };
  el.ondragstart = (e) => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.id);   // «положили карточку в чемодан»
    e.dataTransfer.effectAllowed = 'move';
  };
  el.ondragend = () => el.classList.remove('dragging');
  return el;
}
```

Что тут важно:

- **Данные отделены от картинки.** Объект `card` приходит с сервера, а DOM — просто его отражение. Никаких «данных в атрибутах страницы».
- **`el.dataset.card = card.id`** — связь DOM ↔ данные. Когда куда-то уронили, читают `dataTransfer` и находят карточку в `db`.
- **`onclick` проверяет `dragging`** — чтобы клик после перетаскивания не открывал модалку.

А сам рендер колонок (`app.js:228`) делает нечто важное: **сначала полностью очищает контейнер, потом строит заново**:

```js
render() {
  const inner = document.getElementById('board-inner');
  inner.innerHTML = '';                     // стираем
  const { columns, cards } = this.db.board; // данные
  columns.forEach(col => {
    const colCards = cards.filter(c => c.columnId === col.id);  // группировка
    const div = document.createElement('div');
    …
    colCards.forEach(card => body.appendChild(this.makeCard(card)));
    inner.appendChild(div);
  });
}
```

Это простой (и достаточный для доски) способ синхронизации «данные → экран». Узнаете в главе 8.

---

## 3.6 Формы: как данные уходят на сервер

```html
<input id="ai-text" type="text" placeholder="Спроси что-нибудь…">
<button id="btn-ai-send">➤</button>
```

```js
const input = document.getElementById('ai-text');
const send = () => {
  const text = input.value.trim();
  if (!text) return;
  fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  input.value = '';
};
document.getElementById('btn-ai-send').onclick = send;
input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
```

Четыре вещи, которые здесь надо усвоить:

1. `.value` — содержимое поля (а не `.textContent`!).
2. `.trim()` — убираем пробелы по краям; иначе « » станет «задачей».
3. Пустой ввод не отправляем (`if (!text) return`).
4. `keydown` + `Enter` — ожидаемое поведение, которое любят все.

В проекте та же схема: `openAddCard` → модалка → сбор значений полей (`app.js:426`) → объект → `this.save()`.

**Задача 3.5.** Сделайте на своей странице поле + кнопку «Добавить», при клике элемент списка добавляется (пока без сервера — только в DOM). Бонус: Enter тоже работает, пустые значения игнорируются.

---

## 3.7 Чек-лист «HTML готов»

- [ ] Знаю разницу между `id` и `class`
- [ ] Понимаю, что такое `data-*` атрибуты и зачем они
- [ ] Умею строить элементы `createElement` и защищать текст через `esc()`
- [ ] Понимаю, чем `innerHTML` опасен и когда им можно пользоваться
- [ ] Знаю, что `document.querySelector` ищет по CSS-селекторам
- [ ] Страница открывается, DevTools показывает дерево элементов

---

## ✅ Задачи главы 3 (самостоятельная работа)

1. **Визитка** — из задания 3.1: заголовок, абзац, список, ссылка.
2. **Форма** — из задания 3.5: добавление пункта в список по клику и Enter.
3. **Дерево от руки.** Нарисуйте DOM-дерево для:

   ```html
   <main id="board">
     <div class="column"><h2>Задачи</h2><div class="card">Купить хлеб</div></div>
   </main>
   ```

4. **Разбор чужого кода.** В `public/js/movies.js` найдите `mvCard(m)` и объясните, какой объект в него приходит и какие поля (`title`, `poster`, `watched`) используются.
5. **Защита.** В консоли: `document.body.innerHTML = '<b>тест</b>'`. Потом попробуйте добавить карточку с текстом `<b>жирный</b>` через `textContent` и через `innerHTML` — сравните результат.

**Приёмка:** страница добавляет элементы по клику и Enter, пустой ввод игнорируется, вы объясняете, почему `esc()` нельзя выбрасывать.

**Дальше → [Глава 4. CSS: стиль и раскладка](04-css.md)**
