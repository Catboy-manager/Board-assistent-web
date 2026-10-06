# AGENTS.md — шпаргалка для opencode по этому проекту

Проект — персональная канбан-доска + ИИ-ассистент + новостная лента + «что посмотреть», хостится на ПК пользователя.

## Схема проекта (3 репозитория)

| Репозиторий | Каталог | Что это |
|---|---|---|
| `Board-assistent-web` | `~/kanban-board` | Web-сервер, основной рабочий код |
| `Board-assistent-linux` | `~/kanban-desktop/linux` | Electron-обёртка для Linux (сборка AppImage) |
| `Board-assistent-windows` | `~/kanban-desktop/windows` | Electron-обёртка для Windows (вложенная папка `app/app/`) |

**Паттерн синхронизации десктопов.** Web — источник истины. Код веб-версии забрасывается в desktop-копии, но с переделкой `server.js` на настольный режим:

- `DATA_DIR` = `process.env.KANBAN_DATA_DIR || path.join(os.homedir(), '.kanban-desktop')` (в вебе — `path.join(ROOT,'data')`)
- `CONFIG_FILE` — путь к конфигу в домашней директории пользователя (в вебе — `config.json` рядом со `server.js`). Дефолт: `let config = { ai: {} };`
- `UPLOAD_DIR` — под `DATA_DIR`
- `host` = `process.env.KANBAN_HOST || '127.0.0.1'`; `port` = `process.env.KANBAN_PORT || PORT || config.port || 8080`
- `fs.mkdirSync(DATA_DIR)` перед первым `saveDb()`

При любой правке общего веб-кода синхронизировать в `linux/app/` и `windows/app/app/`: `server.js`, `movies.js`, `news.js`, `games.js`, `messages.js`, `youtube.js`, `assist.js`, `assist-cli.js`, `ai-opencode.json`, `stt/stt.py`, `public/*` (включая `public/js/movies.js`, `news.js`, `games.js`, `msgs.js`, `youtube.js`, `interests.js`), `telegram-bot.js`; затем пересобрать AppImage.

## Глобальный зум интерфейса (`document.documentElement.style.zoom`)

Масштаб живёт в `public/js/canvas.js` (`CANVAS.scale()`), диапазон 0.15–3, состояние в `localStorage` по ключу `kban-view`, индикатор `#zoom-pct` + кнопки `#zoom-ctl` (`−`, `1:1`, `+`). Ctrl/⌘+колесо ловится на `document` в capture-фазе (кроме `.no-zoom`), Ctrl/⌘+`0`/`+`/`-` — клавиатура.

Правила координат (Chromium/Electron, обязательны для нового кода):

| Что | Единицы |
|---|---|
| `getBoundingClientRect()`, `clientX/clientY`, `scrollX/scrollY` | **визуальные** (уже умножены на зум) |
| `offsetLeft/Top/Width/Height`, `style.left/top/width/height`, `scrollWidth` доски | **layout** (делить на `CANVAS.scale()`) |
| `window.innerWidth/innerHeight` | визуальный размер окна; видимая область в layout = `innerWidth / scale()` |
| `position: fixed` (`left/top/right/bottom`, inset, размеры) | layout, но ICB **масштабируется** зумом — обычные `right: 0`/`inset: 0` работают |
| CSS `vw`/`dvh`/`vh` | **не масштабируются** — в CSS делить на `--z` (`var(--zvw)`, `var(--zvh)`), в JS — на `CANVAS.scale()` |

Из этого следует: `CANVAS.toCanvas()` переводит клиентские координаты в layout доски, `visible()/safeTop()/safeRight()` возвращают layout-границы (учитывают топбар и правую ИИ-панель), а любая новая фиксированная панель с правым/нижним якорем обязана использовать `var(--zvw)/var(--zvh)` вместо `100vw/100dvh`.

Регрессия зума: `/tmp/opencode/zoom-test.js` (свой CDP-клиент `/tmp/opencode/cdp.js`, без Playwright) — 47 проверок: якорь под курсором, персистентность, fixed-топбар, drag колонки/плитки и resize плитки/ИИ-панели на z=0.5…2, `safeTop/safeRight`, отсутствие JS-ошибок.

## Ключевые команды и сервис

- Web-служба: `systemd`, юнит `kanban-board` (`sudo systemctl restart kanban-board`). Порт 8080 (HTTP) / 8443 (HTTPS), LAN `192.168.1.100`.
- Локальный путь к ИИ-модели: `opencode run -m opencode/big-pickle --format json` через `runOpencode()` в `server.js` (конфиг `ai-opencode.json`).
- Desktop-тест без GUI: `cd linux && PORT=8124 KANBAN_DATA_DIR=/tmp/opencode/ai-dtest node app/server.js`.
- Cardify: `boardCli()` спавнит `assist-cli.js --db …`; после каждого вызова `db` заново читается с диска.
- Сборка AppImage: в `linux/` через `npm run dist` (electron-builder, бинарник в `dist/`).

## Существующий API

- `/api/data` GET/PUT — доска (db.json), `/api/weather`, `/api/ping`, `/api/upload`, `/api/stt`, `/api/ai/chat`, `/api/ai/voice`, `/api/config`, `/api/files`, `/api/file`
- `/api/movies` GET/POST(добавить) · `/api/movies/:id/toggle|delete|resolve` · `/api/movies/resolve` (пакетный подбор постеров)
- `/api/news?period=today|yesterday` · `/api/news/rate {id,rating}` (-2..2)
- `/api/news?period=today|yesterday` · `/api/news/rate {id,rating}` (-2..2) · `/api/news/pref`
- `/api/music` GET (список локальных треков из `~/Music`) · `/api/music/stream?path=…` (чейанк/стрийм с Range) · `/api/music/mark` (оценка трека) · `/api/music/upload?name=…` POST (бинарное тело/файл → сохраняется в `~/Music`) · `/api/music/delete?path=…` DELETE (удаление файла)
- `/api/notify/send` POST {title,text,app} — уведомление со смартфона (принимает и JSON, и form-urlencoded; опц. ключ `KANBAN_NOTIFY_KEY`) · `/api/notify/history?limit=…` (полная история) · `/api/notify/events` SSE → client `/js/notify.js` (тост + уведомление браузера + вкладка 🔔 с историей) · страница телефона `/notify.html` · тайлинг `/js/tiles.js` (кнопка ⛶ в side-widget, плитки с drag&drop и ресайзом)
- `/api/games` GET (Steam + сторонние, постеры) · `/api/games/refresh` POST · `/api/games/config` POST {steamId,apiKey} · `/api/games/third` POST (добавить стороннюю игру) — модуль `games.js`, UI `/js/games.js`
- `/api/msgs` GET — статистика уведомлений (всего, активных дней, в день, последние) — модуль `messages.js`
- `/api/yt/search?q=…` · `/api/yt/info?id=…` · `/api/yt/stream?id=…` · `/api/yt/thumb?id=…` · `/api/yt/auth/status|cookies|browser|clear` · `/api/yt/watch` POST · `/api/yt/watch/clear` POST · `/api/yt/interests` GET — модуль `youtube.js`, UI `/js/youtube.js` + `/js/interests.js` (требует сети; поиск может отдавать 502 при недоступном upstream)

## Прогресс реализации (checklist)

- [x] Веб + desktop (Electron, AppImage) — доска, колонки, карточки, drag&drop, события, напоминания, файлы проекта
- [x] ИИ-ассистент (opencode CLI bridge), текстовый/голосовой (STT faster-whisper + браузер), TTS piper (ru_RU-irina-medium), wake-слова
- [x] Cardify — занос контента в карточки/память по JSON-правилу `CARDIFY_RULE`
- [x] Telegram-мост (`telegram-bot.js`)
- [x] Git: три приватных репозитория, секреты в `.gitignore`
- [x] **Этап «Вечер»:** бокс снизу слева — вкладка 🎬 «Фильмы» (список, постеры из интернета, постера в модалке, кнопки Кинопоиск/ВК Видео/поиск, отметить просмотренным, удалить)
- [x] **Этап «Новости»:** вкладка 🗞 — сводка за сегодня/вчера (RSS: Лента, РИА, ТАСС, Коммерсантъ, Хабр, NASA), оценки интереса (😞-2 … 🤩+2), пер-категорийные веса выборки, ✨ ИИ-сводка
- [x] БД/индексы новостей: тюнинг ключевых слов под реальные источники (в games только сильные игровые маркеры — видеоигр/гейм/киберспорт/steam/PC/PS5/xbox/nintendo/айта-игры и т.п.; `SPORTS_BLOCK` + категоризация остатков в «other»; проверено: спорт → games = 0)
- [x] **Музыка:** лайв-плеер локальных файлов ПК (готов: `/api/music` список + `/api/music/stream` с Range; папка `~/Music` или `KANBAN_MUSIC_DIR`; вкладка 🎵 в side-widget) — проверено на 5 сгенерированных WAV (список 200, Range 206)
- [x] **To-Do:** синхронизация уведомлений со смартфона в локальной сети (показ всплывающих уведомлений телефона на доске) — POST `/api/notify/send` + SSE `/api/notify/events` + `/notify.html`, проверено live
- [x] Авто-подтяжка постеров: фоновая `prime()` — по одному фильму раз в 6 с, порядок `Без постера → не просмотренные → старые`; при добавлении — постановка в очередь сразу
- [x] **Игры:** вкладка 🎮 — библиотека Steam (список, постеры, ручное обновление) + сторонние игры, конфиг SteamId/API в конфиге
- [x] **Статистика сообщений:** вкладка 📨 — сколько уведомлений пришло, активных дней, в день (сводка из `notify`)
- [x] **YouTube:** вкладка ▶ — поиск, постер, стрим с сервера (yt-dlp), авторизация (cookies/браузер), история просмотра и подборки по интересам (`/js/interests.js`)
- [x] **Глобальный зум интерфейса:** Ctrl+колесо, кнопки `−/1:1/+`, сохранение в `localStorage`, корректные drag/resize под любым зумом, координатная модель и регрессия (см. раздел выше)

## Оптимизации и заметки

- `server.js` — монолит; модули `movies.js`/`news.js` вынесены — держать новые фичи в модулях, а не в server.js.
- Не хранить тяжёлое в git: `config.json` (секреты), `data/`, `ssl/`, `uploads/`, `stt/whisper-tiny/`, `*.onnx`, `dist/`, `node_modules/`.
- Telegram API недоступен с этого хоста (RU DPI): работает только через `HTTPS_PROXY`/`ALL_PROXY` (CONNECT) или зеркало `TELEGRAM_API_BASE`.
- Постеры: основной источник — Bing Images (`murl` из HTML); фолбэк — ИИ-резолвер через opencode (websearch). Yandex.Images отдаёт пустые результаты боту.
- Новости: RIA/ТАСС/Хабр/NASA отвечают 200; Лента/Ъ — редирект (fetch `redirect:'follow'`); space.com кормит `/feeds/all`. Категории: ключевые слова (`политика/техника/игры/космос/авто/прочее`), авто по умолчанию не показывается (пользователь не интересуется).
- Секреты (GitHub PAT, Telegram-токен) НЕ помещать в файлы и не логировать.

## Системные требования для запуска

- Web: Node.js ≥ 18 (глобальный fetch), Python 3 + faster-whisper + torch (STT), piper TTS-модель (data/tts). ОС: Linux. Дефолт Москва (timezone). Подключение к интернету.
- Desktop Linux: Electron + то же самое; AppImage собирается на Linux.
- Desktop Windows: Electron; STT-модель скачивается скриптом `скачать-модели.sh`/инструкцией `СОБРАТЬ.txt`.
- Микрофон/wake-слова: безопасный контекст — `http://localhost` (HTTP) или https с установленным сертификатом. Скриншоты работают только на X11 (не Wayland).

## Правила работы

- Отвечать по-русски, кратко. Не логировать секреты. Не коммитить без явного запроса.
- После правки синхрон. файлов — прогнать `node --check` и перезапустить `kanban-board`.