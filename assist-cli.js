#!/usr/bin/env node
'use strict';

/* assist-cli.js — CLI-инструмент ИИ-ассистента: доступ к доске, памяти и напоминаниям.
   Модель (opencode) вызывает его через bash. Ожидает короткий ответ-подтверждение.

Примеры (--db/--mem/--rem можно опустить, тогда берётся ~/.kanban-desktop):
  node assist-cli.js list
  node assist-cli.js --db <db.json> add "Погулять" "В работе"
  node assist-cli.js --db <db.json> move "Погулять" "Готово"
  node assist-cli.js --db <db.json> done "Погулять"
  node assist-cli.js --db <db.json> remove "Погулять"
  node assist-cli.js --db <db.json> addcol "Идеи"
  node assist-cli.js --db <db.json> renamecol "В работе" "Делаю"
  node assist-cli.js --mem <memory.json> remember "Пользователь любит чёрный чай"
  node assist-cli.js --mem <memory.json> forget "чай"
  node assist-cli.js --rem <reminders.json> remind "Звонок" "+15"
  node assist-cli.js --rem <reminders.json> remind "Дедлайн" "2026-09-14T09:00:00"
*/

const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
  console.log('assist-cli: управление доской/памятью/напоминаниями. См. примеры в комментарии файла.');
  process.exit(0);
}

function argVal(name) {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return '';
}
/* аккуратный разбор: флаги --x value, остальное — позиционные */
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i]] = argv[i + 1]; i++; }
  else positional.push(argv[i]);
}
const base = process.env.KANBAN_DATA_DIR || path.join(os.homedir(), '.kanban-desktop');
const dbPath = flags['--db'] || path.join(base, 'db.json');
const memPath = flags['--mem'] || path.join(base, 'memory.json');
const remPath = flags['--rem'] || path.join(base, 'reminders.json');

const cmd = positional[0] || 'list';
const args = positional.slice(1);

function load(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return def; }
}
function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
function done(msg) { console.log('✅ ' + msg); process.exit(0); }
function fail(msg) { console.log('❌ ' + msg); process.exit(1); }

/* ---------- доска ---------- */
function board() {
  const db = load(dbPath, null);
  if (!db || !db.board) fail('Нет базы доски: ' + dbPath + '. Сначала откройте приложение.');
  return db;
}
function colsOf(db) {
  const cols = db.board.columns || [];
  return cols.map(c => c.title || c.id).join(' / ') || '(нет колонок)';
}
function findCol(db, title) {
  const cols = db.board.columns || [];
  const t = norm(title);
  if (!t) return cols[0] || null;
  return cols.find(c => norm(c.title) === t) || cols.find(c => norm(c.title).includes(t)) || null;
}
function findCard(db, title) {
  const t = norm(title);
  const cards = db.board.cards || [];
  return cards.find(c => norm(c.title) === t) || cards.find(c => t && norm(c.title).includes(t)) || null;
}
function show(db, colId) {
  const cols = db.board.columns || [];
  const line = cols.map(c => {
    const n = (db.board.cards || []).filter(k => k.columnId === c.id).length;
    return (c.id === colId ? '►' : '') + c.title + ' (' + n + ')';
  }).join(', ');
  console.log(line);
}

switch (cmd) {
  case 'list': {
    const db = board();
    for (const c of (db.board.columns || [])) {
      const cards = (db.board.cards || []).filter(k => k.columnId === c.id);
      console.log('[' + c.title + '] ' + cards.map(k => k.title).join(' | ') || '[пусто]');
    }
    process.exit(0);
    break;
  }
  case 'add': {
    const db = board();
    const title = args[0], colTitle = args[1];
    const col = colTitle ? findCol(db, colTitle) : (db.board.columns || [])[0];
    if (!col) fail('Нет такой колонки. Колонки: ' + colsOf(db));
    if (!title) fail('Укажите текст карточки: add "текст" ["колонка"]');
    let card = findCard(db, title);
    if (card) fail('Карточка уже есть: ' + card.title + '. Используйте move/done.');
    db.board.cards.push({ id: uid('c_'), title: title, text: '', columnId: col.id, priority: '', due: '', created: Date.now() });
    save(dbPath, db);
    done('Добавлено в «' + col.title + '»: ' + title);
    break;
  }
  case 'move':
  case 'done': {
    const db = board();
    const title = args[0];
    const card = findCard(db, title);
    if (!card) fail('Не нашёл карточку: ' + (title || '?'));
    const col = cmd === 'done' ? (findCol(db, 'Готово') || findCol(db, 'Сделано') || db.board.columns[db.board.columns.length - 1])
      : findCol(db, args[1] || '');
    if (!col) fail('Нет такой колонки. Колонки: ' + colsOf(db));
    card.columnId = col.id;
    save(dbPath, db);
    done('«' + card.title + '» → ' + col.title);
    break;
  }
  case 'remove': {
    const db = board();
    const card = findCard(db, args[0] || '');
    if (!card) fail('Не нашёл карточку: ' + (args[0] || '?'));
    db.board.cards = (db.board.cards || []).filter(k => k.id !== card.id);
    save(dbPath, db);
    done('Удалено: ' + card.title);
    break;
  }
  case 'addcol': {
    const db = board();
    const title = args[0];
    if (!title) fail('Укажите название колонки');
    const palette = ['#f5b7b1', '#aed6f1', '#a9dfbf', '#f9e79f', '#d7bde2', '#fadbd8'];
    db.board.columns.push({ id: uid('col_'), title: title, color: palette[(db.board.columns || []).length % palette.length] });
    save(dbPath, db);
    done('Колонка создана: ' + title);
    break;
  }
  case 'renamecol': {
    const db = board();
    const col = findCol(db, args[0] || '');
    if (!col) fail('Нет такой колонки. Колонки: ' + colsOf(db));
    col.title = args[1];
    save(dbPath, db);
    done('Колонка переименована: ' + col.title);
    break;
  }
  case 'remember': {
    const text = args.join(' ');
    if (!text) fail('Укажите факт для запоминания');
    const mem = load(memPath, []);
    mem.unshift({ id: uid('mem_'), text, by: 'ai', ts: new Date().toISOString() });
    if (mem.length > 300) mem.length = 300;
    save(memPath, mem);
    done('Запомнил: ' + text);
    break;
  }
  case 'forget': {
    const q = norm(args.join(' '));
    if (!q) fail('Что забыть?');
    const mem = load(memPath, []);
    const before = mem.length;
    const kept = mem.filter(m => !norm(m.text).includes(q));
    save(memPath, kept);
    done('Забыто записей: ' + (before - kept.length));
    break;
  }
  case 'remind': {
    const text = args[0], when = args[1];
    if (!text || !when) fail('Формат: remind "текст" "+минуты" или ISO-время');
    let at;
    if (String(when).startsWith('+')) {
      const mins = parseInt(when.slice(1), 10);
      if (isNaN(mins)) fail('Неверные минуты: ' + when);
      at = new Date(Date.now() + mins * 60000).toISOString();
    } else {
      const d = new Date(when);
      if (isNaN(d.getTime())) fail('Неверное время: ' + when + ' (нужно ISO, напр. 2026-09-14T09:00:00)');
      at = d.toISOString();
    }
    const rems = load(remPath, []);
    rems.push({ id: uid('rem_'), text, at, sent: false, ts: new Date().toISOString() });
    save(remPath, rems);
    done('Напоминание на ' + at + ': ' + text);
    break;
  }
  case 'status': {
    const db = board();
    const total = (db.board.cards || []).length;
    console.log('Колонки: ' + colsOf(db) + '; всего карточек: ' + total);
    process.exit(0);
    break;
  }
  default:
    fail('Неизвестная команда: ' + cmd);
}