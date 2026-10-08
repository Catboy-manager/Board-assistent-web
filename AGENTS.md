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

При любой правке общего веб-кода синхронизировать в `linux/app/` и `windows/app/app/`: `server.js`, `movies.js`, `news.js`, `games.js`, `messages.js`, `youtube.js`, `smart.js`, `assist.js`, `assist-cli.js`, `ai-opencode.json`, `stt/stt.py`, `public/*` (включая `public/js/movies.js`, `news.js`, `games.js`, `msgs.js`, `youtube.js`, `interests.js`, `smart.js`), `telegram-bot.js`; затем пересобрать AppImage. Синк-скрипт: `/tmp/opencode/sync-desktop.py` (копирует файлы + патчит 3 вставки в desktop `server.js`); после него `diff web/server.js linux/app/server.js` должен показывать только строку `sslPort`.

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

## Умный дом (этап 1, модуль `smart.js`)

Локальная автоматизация без облаков: опрос → diff → событие → сценарии. Источник события может быть любым (опрос, вебхук, команда), контракт сценариев не меняется.

- **Модуль:** `smart.js` подключается как `require('./smart')({ dataDir, readBody, json, cfg })`; в `server.js` три вставки — require после `youtube`, роут `/api/smart` после `/api/yt`, `smart.contextSummary()` в `buildPrompt`. Модуль обязан вернуть truthy из `handle()` (сам пишет ответ через `json(res,…)`).
- **Состояние:** `data/smart.json` — только последнее состояние (`devices/scenes/poll/hosts/scanAt`); история не хранится. События — кольцо в памяти (100 шт.), не персистятся.
- **Адаптеры:** `manual`, `webhook`, `http` (HTTP-мост через `meta.cmdUrl`/`meta.pollUrl`) — работают; `glagol` — работает (обнаружение и управление станцией, см. ниже); `tuya`, `voice`, `mqtt` — стабы, отвечают 501 с подсказкой (этап 3). Новый адаптер = функция `{ poll, cmd, stub }` в `ADAPTERS`.
- **Глагол (Яндекс Станция):** токен OAuth x_token — `POST /api/smart/config {yandexToken}` (файл `data/yandex-token.txt`, mode 600) или `KANBAN_YANDEX_TOKEN`; GET `/api/smart` отдаёт `yandex:boolean`. Адаптер `glagol`:
  - облако: устройства `m/v3/user/devices` (кэш 60 с), действия `POST m/user/{item_type}s/{id}/actions` (payload `{actions:[{type,state:{instance,value}}]}`, типы из `IOT_TYPES`), TTS/команды через сценарии (`m/user/scenarios` create → actions → delete, payload типа «ха» из AlexxIT/YandexStation);
  - локально: `meta.host/port` + device token (`quasar.yandex.net/glagol/token?device_id=&platform=`), WS-клиент `GlagolSocket` (RFC 6455, сокет `net`), первый кадр `softwareVersion`, команды `sendText` / `serverAction`; запросы шлются с порта **5353** для mDNS;
  - команды: `on/off/toggle`, `volume` (+N/-N относит.), `brightness`, `say`/`tts` (TTS), `command`/`alice` (текстовая команда), `set {cap:val}` — см. `IOT_TYPES`.
  - **вход по QR (OAuth device flow, RFC 8628):** `POST /api/smart/auth {action:'start'}` → `oauth.yandex.ru/device/code` (клиент PASSPORT_CLIENT_ID `c0ebe342…` — публичный из Android-приложений Яндекса) → `{user_code, url, left, interval}`; `action:'status'/'poll'` сервером опрашивает `oauth.yandex.ru/token`, при `access_token` → `setYandexToken`. UI в «Устройства» (`sm-ya`): QR через `api.qrserver.com` (data=`ya.ru/device?code=<user_code>`, редиректит на подтверждение), код под картинкой, автоопрос ~5 с. `action:'stop'` отменяет; `POST /api/smart/config {yandexToken:''}` — отзыв. QR-картинка зависит от внешнего сервиса, код показывается всегда.
- **Обнаружение (важно):** mDNS-сканера — сокет mDNS обязан биндиться на **порт 5353** (reuseAddr), иначе станции/ТВ Яндекса игнорируют запросы с эфемерного порта; запросы шлются волнами (0/1.3/2.6/3.8 c). SSDP (порт 0) — обычно пусто. Сканер после сети делает также **дискавери**: `stage:'discovery'` (mDNS+SSDP, 5 с), найденные станции получают `deviceId/platform/mports[1961]/title` (карта `YANDEX_PLATFORMS`: cucumber=Станция Миди и т.д.) и подсказку `glagol`; ping-невидимые, но mDNS-живые хосты тоже в `hosts`. Плюс живые по `ip -o neigh`.
- **Опрос:** `POST /api/smart/poll {enabled, interval}` (clamp ≥ 2000 мс) → `tick()` каждый интервал; диф состояния → `emit(state)` → `runScenes()`; упавший мост/таймаут → `online:false` + событие `offline`.
- **Сцены:** триггер `state` (операции `change/eq/ne/gt/lt/rise/fall`) и `time` (`HH:MM`, проверяется по таймеру); защита от петли — `busyScenes` (Set в памяти, НЕ в JSON — иначе сцена «зависает» навсегда) + cooldown 60 с.
- **Скан LAN:** `POST /api/smart/scan` → discaver (mDNS+SSDP) → ping-sweep (64 параллельно) → TCP-пробы `PORTS` → `httpBrief` + `fingerprint` → `neighMap()` (MAC из `ip -o neigh`). Прогресс/SSE: `stage:'discovery'|'ping'|'tcp'`. Живые хосты без портов тоже попадают в `hosts` (`alive:true, ports:[]`). Маска сети берётся из `netmask` (`prefixOf`), link-local `169.254.x` пропускается.
- **Безопасность:** `KANBAN_SMART_KEY` (env или `config.smart.key`) → все POST требуют `x-smart-key`/`?key=`; ключа нет → только приватные IP (`isPrivateIp`). GET всегда открыт. В UI ключ вводится в панели, хранится в `localStorage['kban-smart-key']`, в CLI — `KANBAN_SMART_KEY`. Токен Яндекса НЕ возвращается по GET (только факт `yandex:true/false`), хранится в `data/` а не в `config.json`.
- **UI:** панель в `#panels-right` (`#smart-panel`/`#sp-smart`), файл `public/js/smart.js` (`window.SMART.load`), плитка 🏠 в каталоге (см. `place.js`), стили `.sm-*` в конце `style.css` (инпуты — через `.sm-pane input.sm-in` из-за специфичности `input[type=text]`).
- **CLI/ИИ:** `node assist-cli.js smart list|scan|on|off|toggle|set|say` (`say "Имя" --msg "текст"`) и `smart ytoken "<x_token>"` (HTTP к серверу, см. `api()` в `assist-cli.js`); в промпт ИИ `contextSummary()` подставляет устройства и команды.
- **Тест:** `/tmp/opencode/smart-test.js` — 41 проверка (API, SSE, HTTP-мост, сцены, скан реальной LAN, Glagol/config/токен). Запуск: `node /tmp/opencode/smart-test.js`.

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
- `/api/games` GET (Steam + сторонние, постеры) · `/api/games/refresh` POST · `/api/games/config` POST {steamId,apiKey} · `/api/games/third` POST (добавить стороннюю игру) · `/api/games/catalog` POST {q} (поиск в каталоге GOG + Steam без ключей — модуль `games.js`, UI `/js/games.js`)
- `/api/msgs` GET — статистика уведомлений (всего, активных дней, в день, последние) — модуль `messages.js`
- `/api/yt/search?q=…` · `/api/yt/info?id=…` · `/api/yt/stream?id=…` · `/api/yt/thumb?id=…` · `/api/yt/auth/status|cookies|browser|clear` · `/api/yt/watch` POST · `/api/yt/watch/clear` POST · `/api/yt/interests` GET — модуль `youtube.js`, UI `/js/youtube.js` + `/js/interests.js` (требует сети; поиск может отдавать 502 при недоступном upstream)
- `/api/smart` GET (устройства/сцены/hosts/события) · `/api/smart/events` SSE · `POST /api/smart/{scan,cmd,device,poll,scene,webhook/:id}` · `POST /api/smart/device/:id/{delete,update}` · `POST /api/smart/scene/:id/{delete,toggle,run}` · `POST /api/smart/auth {action:start|stop|status}` · `POST /api/smart/config {yandexToken}` — модуль `smart.js`, UI `/js/smart.js` (см. раздел «Умный дом»)

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
- [x] **Умный дом, этап 1:** LAN-скан (ping + TCP + fingerprint), устройства с последним состоянием, опрос → diff → события (SSE), сценарии, панель UI, CLI для ИИ, ключ `KANBAN_SMART_KEY` (см. раздел выше). Этап 2 — Glagol-адаптер станции (локальный WS), этап 3 — Tuya/Yandex cloud/голос

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