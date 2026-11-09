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

При любой правке общего веб-кода синхронизировать в `linux/app/` и `windows/app/app/`: `server.js`, `movies.js`, `news.js`, `games.js`, `messages.js`, `youtube.js`, `smart.js`, `course.js`, `assist.js`, `assist-cli.js`, `ai-opencode.json`, `stt/stt.py`, `public/*` (включая `public/js/movies.js`, `news.js`, `games.js`, `msgs.js`, `youtube.js`, `interests.js`, `smart.js`, `core/dash.js`, `components/course.js`), `telegram-bot.js`, а также папку `kurs/` (курс обучения, ∼3.6 МБ: `*.md` + `img/*.png`) — она нужна модулю `course.js` и в desktop-копиях отсутствует, копировать целиком; затем пересобрать AppImage. Синк-скрипт `scripts/sync-desktop.py` копирует общие файлы, `public/`, `kurs/`, `stt/`, а для `server.js` берёт web-версию и подставляет desktop-заголовок (`DATA_DIR`/`UPLOAD_DIR`/`CONFIG_FILE` + legacy-перенос). После синка `diff linux/app/server.js windows/app/app/server.js` должен быть пустым, а `diff web/server.js linux/app/server.js` — показывать только desktop-заголовок. Скрипт также кладёт `preload.js` в корни desktop-репозиториев и `history-collect.py` в `linux/app/`, `windows/app/app/`, `windows/app/`. Ручная альтернатива: скопировать перечисленные файлы + `kurs/` и добавить в desktop `server.js` require/роуты `course`, `sandbox`, `updater`, а `gh` вызвать с `{root, projectsDir, cfg}`.

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

## Окна-панели на доске (`public/js/place.js`)

Плитки `.bp-tile` живут в `#board-panels`, а колонки задач — в `#board-inner`; оба внутри `#world` с тем же origin, поэтому `offset*` плиток и колонок сравнимы напрямую. `collides()` кроме других плиток обходит прямоугольники колонок задач (кэш `avoidRects` из `#board-inner .column`, обновляется `refreshAvoid()`), поэтому ни drag/resize/drop, ни `flowScan()`, ни `tidyAll()` не кладут панель на карточки. `tidyAll()` (🧹) — first-fit слева-направо/сверху-вниз по видимой области, где колонки задач и уже поставленные плитки — препятствия (панели заполняют место справа и под карточками, размер сохраняется); шаг укладки кратен `SNAP` без округления вверх, иначе соседние плитки перекрываются.

## Умный дом (этап 1, модуль `smart.js`)

Локальная автоматизация без облаков: опрос → diff → событие → сценарии. Источник события может быть любым (опрос, вебхук, команда), контракт сценариев не меняется.

- **Модуль:** `smart.js` подключается как `require('./smart')({ dataDir, readBody, json, cfg })`; в `server.js` три вставки — require после `youtube`, роут `/api/smart` после `/api/yt`, `smart.contextSummary()` в `buildPrompt`. Модуль обязан вернуть truthy из `handle()` (сам пишет ответ через `json(res,…)`).
- **Состояние:** `data/smart.json` — только последнее состояние (`devices/scenes/poll/hosts/scanAt`); история не хранится. События — кольцо в памяти (100 шт.), не персистятся.
- **Адаптеры:** `manual`, `webhook`, `http` (HTTP-мост через `meta.cmdUrl`/`meta.pollUrl`) — работают; `glagol` — работает (обнаружение и управление станцией, см. ниже); `tuya`, `voice`, `mqtt` — стабы, отвечают 501 с подсказкой (этап 3). Новый адаптер = функция `{ poll, cmd, stub }` в `ADAPTERS`.
- **Глагол (Яндекс Станция):** токен OAuth x_token — `POST /api/smart/config {yandexToken}` (файл `data/yandex-token.txt`, mode 600) или `KANBAN_YANDEX_TOKEN`; GET `/api/smart` отдаёт `yandex:boolean`. Адаптер `glagol`:
  - облако: устройства `m/v3/user/devices` (кэш 60 с), действия `POST m/user/{item_type}s/{id}/actions` (payload `{actions:[{type,state:{instance,value}}]}`, типы из `IOT_TYPES`), TTS/команды через сценарии (`m/user/scenarios` create → actions → delete, payload типа «ха» из AlexxIT/YandexStation);
  - локально: `meta.host/port` + device token (`quasar.yandex.net/glagol/token?device_id=&platform=`), WS-клиент `GlagolSocket` (RFC 6455, сокет `net`), первый кадр `softwareVersion`, команды `sendText` / `serverAction`; запросы шлются с порта **5353** для mDNS;
  - команды: `on/off/toggle`, `volume` (+N/-N относит.), `brightness`, `say`/`tts` (TTS), `command`/`alice` (текстовая команда), `set {cap:val}` — см. `IOT_TYPES`. **TTS**: реализован через `sendText «произнеси …»` — `update_form` (repeat_phrase) возвращает SUCCESS, но станция молчит, когда Алиса не в активном диалоге (проверено эмпирически); фраза чистится от «»/"' и переносов; фолбэк `glagolSay` (update_form) → облачный сценарий.
  - **вход по QR (OAuth device flow, RFC 8628):** `POST /api/smart/auth {action:'start'}` → `oauth.yandex.ru/device/code` (клиент PASSPORT_CLIENT_ID `c0ebe342…` — публичный из Android-приложений Яндекса) → `{user_code, url, left, interval}`; `action:'status'/'poll'` сервером опрашивает `oauth.yandex.ru/token`, при `access_token` → `setYandexToken`. UI в «Устройства» (`sm-ya`): QR через `api.qrserver.com` (data=`ya.ru/device?code=<user_code>`, редиректит на подтверждение), код под картинкой, автоопрос ~5 с. `action:'stop'` отменяет; `POST /api/smart/config {yandexToken:''}` — отзыв. QR-картинка зависит от внешнего сервиса, код показывается всегда.
- **Обнаружение (важно):** mDNS-сканера — сокет mDNS обязан биндиться на **порт 5353** (reuseAddr), иначе станции/ТВ Яндекса игнорируют запросы с эфемерного порта; запросы шлются волнами (0/1.3/2.6/3.8 c). SSDP (порт 0) — обычно пусто. Сканер после сети делает также **дискавери**: `stage:'discovery'` (mDNS+SSDP, 5 с), найденные станции получают `deviceId/platform/mports[1961]/title` (карта `YANDEX_PLATFORMS`: cucumber=Станция Миди и т.д.) и подсказку `glagol`; ping-невидимые, но mDNS-живые хосты тоже в `hosts`. Плюс живые по `ip -o neigh`.
- **Опрос:** `POST /api/smart/poll {enabled, interval}` (clamp ≥ 2000 мс) → `tick()` каждый интервал; диф состояния → `emit(state)` → `runScenes()`; упавший мост/таймаут → `online:false` + событие `offline`.
- **Сцены:** триггер `state` (операции `change/eq/ne/gt/lt/rise/fall`) и `time` (`HH:MM`, проверяется по таймеру); защита от петли — `busyScenes` (Set в памяти, НЕ в JSON — иначе сцена «зависает» навсегда) + cooldown 60 с.
- **Скан LAN:** `POST /api/smart/scan` → discaver (mDNS+SSDP) → ping-sweep (64 параллельно) → TCP-пробы `PORTS` → `httpBrief` + `fingerprint` → `neighMap()` (MAC из `ip -o neigh`). Прогресс/SSE: `stage:'discovery'|'ping'|'tcp'`. Живые хосты без портов тоже попадают в `hosts` (`alive:true, ports:[]`). Маска сети берётся из `netmask` (`prefixOf`), link-local `169.254.x` пропускается.
- **Безопасность:** `KANBAN_SMART_KEY` (env или `config.smart.key`) → все POST требуют `x-smart-key`/`?key=`; ключа нет → только приватные IP (`isPrivateIp`). GET всегда открыт. В UI ключ вводится в панели, хранится в `localStorage['kban-smart-key']`, в CLI — `KANBAN_SMART_KEY`. Токен Яндекса НЕ возвращается по GET (только факт `yandex:true/false`), хранится в `data/` а не в `config.json`.
- **UI:** панель в `#panels-right` (`#smart-panel`/`#sp-smart`), файл `public/js/smart.js` (`window.SMART.load`), плитка 🏠 в каталоге (см. `place.js`), стили `.sm-*` в конце `style.css` (инпуты — через `.sm-pane input.sm-in` из-за специфичности `input[type=text]`).
- **CLI/ИИ:** `node assist-cli.js smart list|scan|on|off|toggle|set|say` (`say "Имя" --msg "текст"`) и `smart ytoken "<x_token>"` (HTTP к серверу, см. `api()` в `assist-cli.js`); в промпт ИИ `contextSummary()` подставляет устройства и команды.
- **Тест:** `/tmp/opencode/smart-test.js` — 41 проверка (API, SSE, HTTP-мост, сцены, скан реальной LAN, Glagol/config/токен). Запуск: `node /tmp/opencode/smart-test.js`.

## Обучение (модуль `course.js`, вкладка 📚 «Курс»)

Курс «Своя канбан-доска с нуля» лежит в `kurs/` (README + `01…13*.md` + `otvety.md` + `img/*.png`) и читается прямо в браузере — четвёртая кнопка в `#view-switch` (`data-view="course"`).

- **Модуль:** `course.js` = `require('./course')({ root: ROOT, json })`; в `server.js` две вставки — require после `smart` и роут `/api/course` после `/api/smart`. Возвращает truthy из `handle()`.
- **API:** `GET /api/course/list` → `{files:[{name,title,num,kind}]}` (порядок README → 01…13 → otvety, `title` из первой строки `# `); `GET /api/course/file?name=<file>.md` → сырой markdown (`text/plain`); `GET /api/course/img?name=<NN-*.png>` → картинка. Whitelist имён: `/^[a-z0-9][a-z0-9._-]*\.(md|png…)$/i` + проверка нормализованного пути внутри `kurs/`/`kurs/img/` (path traversal отбит).
- **UI:** `public/js/components/course.js` (`window.COURSE.init/open`) — собственный мини-рендерер markdown (без внешних библиотек): fenced-блоки с кнопкой «Копировать», таблицы, task-списки `- [ ]`, blockquote, `#`-заголовки с slug-id для якорей, картинки (`/api/course/img`), ссылки `.md` → переход по главам, внешние → `target=_blank`, raw HTML `<details>/<code>` пропускается. Слева оглавление с поиском, прогресс-бар, prev/next, лайтбокс картинок; последняя глава хранится в `localStorage['nb-course-chapter']`. Стили в конце `public/css/dash.css` (`.course-*`), вид-правила `data-view="course"` рядом с `cookies`. `dash.js` `setView('course')` вызывает `COURSE.init()`.
- **Тест:** `/tmp/opencode/course-test.js` — 25 проверок через CDP (TOC, рендеринг README/глав, таблицы/картинки/чек-боксы, навигация TOC/md-ссылки/якорь/prev-next, поиск, персистентность, отсутствие JS-ошибок). Запуск: `node /tmp/opencode/course-test.js` (нужен headless Chromium на :9222).

## Песочница (вкладка 🧪, модуль `sandbox.js`)

Встроенный раннер кода без Jupyter: Python (`/usr/bin/python3 -I -B`), Node.js (`process.execPath`), Bash (`/bin/bash --noprofile --norc`). Вкладка `data-view="sandbox"` в `#sandbox-view`.

- **Модуль:** `require('./sandbox')({ json, readBody })`; в `server.js` require после `updater` и роут `/api/sandbox` после `/api/update`.
- **API:** `GET /api/sandbox/info` → `{ok,bwrap,langs,defaultTimeout,maxTimeout,maxCode}`; `POST /api/sandbox/run {lang,code,stdin,timeout}` → `{ok,code,stdout,stderr,ms,timedOut,truncated,isolated,warning,error}`.
- **Изоляция:** если есть `/usr/bin/bwrap` (`KANBAN_BWRAP`), код выполняется в `--ro-bind <tmp> /work --chdir /work` с `--unshare-all`, пустым `/tmp` и без сети; fallback — обычный запуск с предупреждением `isolated:false`. Важно: нельзя делать `--tmpfs /tmp` и затем `--chdir /tmp/...` — bwrap не создаёт каталог; рабочий шаблон — `--ro-bind` временного каталога в `/work`.
- **Лимиты:** код ≤200 КБ, stdout/stderr ≤256 КБ (при переполнении процесс убивается), timeout 1–30 с (дефолт 10 с), 20 запусков/мин на IP. Процесс запускается `detached`, при таймауте/переполнении убивается вся группа (`-pid`).
- **UI:** `public/js/components/sandbox.js` — редактор, язык, таймаут, stdin, Ctrl+Enter, копирование вывода, сохранение кода в `localStorage`; `dash.js` `setView('sandbox')` вызывает `SANDBOX.init()`.

## GitHub (вкладка 🐙, модуль `gh.js`)

Публичные репозитории GitHub + локальные проекты. Вкладка `data-view="github"` в `#github-view`.

- **Модуль:** `require('./gh')({ dataDir, json, root: ROOT, projectsDir: () => getProjectsDir(), cfg: () => config })` — в desktop `root`/`projectsDir`/`cfg` обязательны.
- **API:** существующий `GET /api/gh/digest`; новый `GET /api/gh/repos?refresh=1` → `{ok,owner,hasToken,repos,local,error?}`. Токен берётся из `config.github.token` или `GITHUB_TOKEN`; без токена GitHub отдаёт только публичные репозитории.
- **Кеш:** `data/gh-repos.json`, TTL 10 минут; локальный кеш — 60 с. Локальные проекты: `projectsDir`, корень web-репозитория, `~/Documents/kanban-desktop/{linux,windows}`; для каждого читается `git remote/branch/last commit` и `README` (описание).
- **UI:** `public/js/components/github-view.js` — поиск, сортировка (обновление/звёзды/имя), карточки репозиториев, блок локальных проектов, копирование пути; `dash.js` `setView('github')` вызывает `GHVIEW.init()`.

## Обновление (вкладка 🔄, модуль `updater.js`)

Кнопка «Проверить» и «Обновить и перезапустить» в настройках (`pane-update`).

- **Модуль:** `require('./updater')({ root: ROOT, json, readBody, dataDir: DATA_DIR, cfg: () => config })`.
- **API:** `GET /api/update/check?refresh=0|1` → `{ok,supported,branch,upstream,current,latest,behind,ahead,commits,dirty,untracked,fetchError}`; `POST /api/update/apply` → `git pull --ff-only` + рестарт; `GET /api/update/key` → `{required}`.
- **Безопасность:** только приватные IP (loopback/LAN) либо `x-update-key` = `KANBAN_UPDATE_KEY`/`config.updateKey`; при грязных tracked-файлах pull блокируется; untracked не мешают.
- **Рестарт:** `KANBAN_UPDATE_RESTART` (команда) → `systemctl restart kanban-board` (если есть) → `process.exit(0)`; в desktop (`KANBAN_DESKTOP=1`) авто-рестарт отключён — обновление вручную.
- **Важно:** для приватных репозиториев `git fetch` без токена падает (`fetchError`), кнопка обновления не сработает — нужен credential helper/PAT на сервере.
- **Systemd:** для авто-обновления `kanban-board.service` должен иметь `Restart=always` (сейчас так), иначе процесс после `exit(0)` не поднимется.

## Скрытие панелей (настройки → 🧩 Панели)

`public/js/core/dash.js`: список `PANELS` (key, label, selector), `localStorage['nb-hidden-panels']`, функции `getHidden/setHidden/applyPanels`. `dash.js` при старте вызывает `applyPanels()`, добавляет класс `.panel-hidden` к скрытым селекторам. В настройках (`app.js`, `pane-panels`) — чекбоксы `.panel-toggle`, кнопка «Показать все»; изменения применяются сразу.

## Интересы/YouTube с истории устройства

- **Desktop:** `preload.js` отдаёт `window.KANBAN_LOCAL.collectHistory()` → IPC `kanban:collect-history` в `main.js` → `history-collect.py` (только история, без cookies). Скрипт читает SQLite-копии Chrome/Chromium/Brave/Edge/Vivaldi/Opera и Firefox (Linux/macOS/Windows), отдаёт `{ok,rows:[{url,title}],sources,count}`.
- **Web:** кнопка «📥 История с этого устройства» открывает файл экспорта `.txt/.json/.html`; парсинг на клиенте (`cookies.js`), затем `POST /api/interests/apply-rows {rows,source}`.
- **API:** `POST /api/interests/apply-rows` (`youtube.js`) прогоняет строки через `parseHistoryRows` + `applyHistorySignals`, возвращает `{count,updates,searches,videos,themes,portrait,interests}`. Cookies для интересов не используются; `/api/yt/watch` теперь принимает `source` (по умолчанию `panel`).

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
- `/api/notify/send` POST {title,text,app} — уведомление со смартфона (принимает и JSON, и form-urlencoded; опц. ключ `KANBAN_NOTIFY_KEY`) · `/api/notify/history?limit=…` (полная история) · `/api/notify/events` SSE → client `/js/notify.js` (тост + уведомление браузера + вкладка 🔔 с историей) · страница телефона `/notify.html` · тайлинг `/js/tiles.js` (кнопка ⛶ в side-widget, плитки с drag&drop и ресайзом). **Дедуп:** форвардер на телефоне шлёт одно и то же уведомление (апдейты прогресса «Отправка видео…», «N updates» и т.п.) по нескольку раз в секунду — `notify.js` отбрасывает идентичные `app+title+text+user+chat` повторы в окне `KANBAN_NOTIFY_DEDUP` (дефолт 30000 мс) до сохранения и до SSE
- `/api/games` GET (Steam + сторонние, постеры) · `/api/games/refresh` POST · `/api/games/config` POST {steamId,apiKey} · `/api/games/third` POST (добавить стороннюю игру) · `/api/games/catalog` POST {q} (поиск в каталоге GOG + Steam без ключей — модуль `games.js`, UI `/js/games.js`)
- `/api/msgs` GET — статистика уведомлений (всего, активных дней, в день, последние) — модуль `messages.js`
- `/api/sounds/config` GET/POST · `/api/sounds/list` GET (встроенные + загруженные) · `/api/sounds/upload` POST `{name,data:dataURL}` (mp3/wav/ogg/m4a/flac/webm, ≤12 МБ → `uploads/sounds/`) · `/api/sounds/delete` POST `{src}` (только свои) — модуль `sounds.js`, UI `/js/components/sounds-ui.js` (карточка 🔊 `#w-sounds`; встроенные примеры лежат в `public/sounds/*.mp3` и отдаются как `/sounds/<file>`, загрузки — как `/uploads/sounds/<file>`). `/uploads/` в `server.js` теперь отдаёт подкаталоги (нормализация + проверка префикса `UPLOAD_DIR`).
- **Звуки (модуль `sounds.js`):** 10 встроенных примеров — `notify (по умолчанию) / soft / bell / message / pop / drop / success / alert / urgent / arpeggio`; конфиг `data/sounds.json` = `{default:{enabled,volume,src},rules:[{pattern,src,volume,enabled}]}`; `pick()` выбирает звук по подстроке (app/title/text/user/chat), fallback — `default`; `resolveSrc` нормализует путь. `notify-sound.js` (клиент) играет `<audio id="notif-sound">`.
- `/api/yt/search?q=…` · `/api/yt/info?id=…` · `/api/yt/stream?id=…` · `/api/yt/thumb?id=…` · `/api/yt/auth/status|cookies|browser|clear` · `/api/yt/watch` POST · `/api/yt/watch/clear` POST · `/api/yt/interests` GET — модуль `youtube.js`, UI `/js/youtube.js` + `/js/interests.js` (требует сети; поиск может отдавать 502 при недоступном upstream). Поиск запоминается в `data/yt-queries.json` (`addQuery`), из запросов+просмотров строятся авто-темы (`EXTRA_THEMES`/`deriveThemes`, порог ≥2 сигнала).
- **Импорт истории → Интересы (с прогрессом):** `POST /api/interests/import {browser}` возвращает `{job}` и запускает фоновую задачу; `GET /api/interests/import/status?job=…&since=N` — инкрементальный опрос: `{ok,done,next,events,result}` (клиент опрашивает каждые ~500 мс, `since` = индекс уже полученных событий; задача живёт 10 мин). Есть и SSE-вариант `GET /api/interests/import/events?job=…`, но UI его не использует — см. «Лимит соединений». Этапы: `start/scan/read/parse/tags/tag/apply/verify/themes/portrait/done` (в `tag` — `{icon,label,tag}`); `POST /api/interests/rebuild-from-cookies` (body = строки истории `url\tзаголовок`, пусто → просто пересчёт) — синхронный фолбэк; `GET /api/interests/portrait` — «портрет человека». Общий обработчик — `youtube.interestsHandle`. UI — `/js/components/cookies.js` (прогресс-бар, живой лог, чипы тегов, портрет; фолбэк на rebuild если задача не найдена).
  **ВАЖНО (логика после фикса ложных интересов):** интересы строятся **только из реальных данных истории** — поисковых запросов (`parseHistoryRows`: `q`/`text` у google/yandex/bing/ddg/startpage/mail) и просмотренного на YouTube (`watch?v=`, `/shorts/`, `youtu.be`). Cookies — **НЕ** источник интересов: старый `cookieSignals()` гадал по подстрокам cookie-доменов/заголовков и давал ложные срабатывания (подстрока `nba` внутри `kanban` → выдуманный «Спорт»); удалён. Cookies по-прежнему читаются и пишутся в `COOKIES_FILE` только для yt-dlp. `readOneHistoryDb` возвращает строки `url\tзаголовок`; `applyHistorySignals` кладёт ролики в `watch` с `source:'history'` (dur 0), запросы → `addQuery`; старые записи `source:'cookies'`/`'history'` снимаются перед вставкой. `matchesWord` — стем в начале слова (не подстрока). Пути браузеров кросс-платформенные (`chromeRoots`/`firefoxRoots`), БД копируется с `-wal`/`-shm` (`copyDbWithWal`).

## Лимит соединений браузера (важно, HTTP/1.1)

Браузер держит максимум **6** соединений на хост. Каждый долгоживущий поток (SSE/streaming fetch) занимает слот, и при 6 занятых **любой** новый запрос зависает навсегда. Это уже приводило к «SSE недоступен» в импорте cookies. Правила:

- **Не открывать** новый долгоживущий SSE/stream на загрузке страницы. Базовые потоки после оптимизации: `notify`, `smart`, `ops` (общий), `assist` = **4**. Консоль (`/api/console/events`, streaming fetch) **не** грузить заранее — только при открытии вкладки консоли (убрано из `loadModules()` в `dash.js`, lazy-загрузка в `sys.js`).
- **`ops` и `stats`** слушают один `/api/ops/events`: `ops.js` держит EventSource и рассылает `window.OPS.subscribe(fn)`, `stats.js` подписывается (свой ES — только фолбэк).
- **`notify.js` replay:** сервер при подключении реплеит 20 записей с `replay:true` — нельзя дёргать `loadHistory()` на каждую (было ~20 запросов подряд, шторм). Реплеи батчатся в один отложенный перезапрос.
- **Прогресс импорта cookies — опросом** (`/api/interests/import/status`), а не SSE: короткие запросы не занимают слот постоянно.
- Диагностика: `ss -tn | grep ':8080'` — считать уникальные (каждая связь видна с обеих сторон ×2); в CDP `Network.requestWillBeSent` фильтровать по `/events`.
- `/api/smart` GET (устройства/сцены/hosts/события) · `/api/smart/events` SSE · `POST /api/smart/{scan,cmd,device,poll,scene,webhook/:id}` · `POST /api/smart/device/:id/{delete,update}` · `POST /api/smart/scene/:id/{delete,toggle,run}` · `POST /api/smart/auth {action:start|stop|status}` · `POST /api/smart/config {yandexToken}` — модуль `smart.js`, UI `/js/smart.js` (см. раздел «Умный дом»)
- `/api/course/list` GET (список глав) · `/api/course/file?name=…md` GET (markdown) · `/api/course/img?name=…png` GET (картинка) — модуль `course.js`, UI `/js/components/course.js` (см. раздел «Обучение»)
- `/api/sandbox/info` GET · `/api/sandbox/run` POST `{lang,code,stdin,timeout}` — модуль `sandbox.js`, UI `/js/components/sandbox.js` (см. раздел «Песочница»)
- `/api/gh/repos?refresh=1` GET — публичные репозитории + локальные проекты — модуль `gh.js`, UI `/js/components/github-view.js` (см. раздел «GitHub»)
- `/api/update/check?refresh=0|1` GET · `/api/update/apply` POST · `/api/update/key` GET — модуль `updater.js`, UI в настройках `pane-update` (см. раздел «Обновление»)
- `/api/interests/apply-rows` POST `{rows,source}` — импорт истории с устройства (desktop: `/api/yt/interests/apply-rows` через UI), модуль `youtube.js` (см. раздел «Интересы/YouTube с истории устройства»)

## Прогресс реализации (checklist)

- [x] Веб + desktop (Electron, AppImage) — доска, колонки, карточки, drag&drop, события, напоминания, файлы проекта
- [x] ИИ-ассистент (opencode CLI bridge), текстовый/голосовой (STT faster-whisper + браузер), TTS piper (ru_RU-irina-medium), wake-слова. **Wake-слова: фон. прослушивание (`/js/wake.js`, кнопка 🎤 `#btn-wake`) отключено** — код остался, но не подключается в `index.html`; голосовой ввод в чате ассистента работает (`assistant.js`, `setChatVoice` — no-op).
- [x] Cardify — занос контента в карточки/память по JSON-правилу `CARDIFY_RULE`
- [x] Telegram-мост (`telegram-bot.js`)
- [x] Git: три репозитория, секреты в `.gitignore`
- [x] **Этап «Вечер»:** бокс снизу слева — вкладка 🎬 «Фильмы» (список, постеры из интернета, постера в модалке, кнопки Кинопоиск/ВК Видео/поиск, отметить просмотренным, удалить)
- [x] **Этап «Новости»:** вкладка 🗞 — сводка за сегодня/вчера (RSS: Лента, РИА, ТАСС, Коммерсантъ, Хабр, NASA + открытые Telegram/VK: Двач, Mash, SHOT, Baza, Readovka, Лентач, Meduza, BBC и др.), фильтр шлака, горячность по просмотрам/репостам, оценки интереса (😞-2 … 🤩+2), пер-категорийные веса выборки, ✨ ИИ-сводка
- [x] БД/индексы новостей: тюнинг ключевых слов под реальные источники (в games только сильные игровые маркеры — видеоигр/гейм/киберспорт/steam/PC/PS5/xbox/nintendo/айта-игры и т.п.; `SPORTS_BLOCK` + категоризация остатков в «other»; проверено: спорт → games = 0)
- [x] **Музыка:** лайв-плеер локальных файлов ПК (готов: `/api/music` список + `/api/music/stream` с Range; папка `~/Music` или `KANBAN_MUSIC_DIR`; вкладка 🎵 в side-widget) — проверено на 5 сгенерированных WAV (список 200, Range 206)
- [x] **To-Do:** синхронизация уведомлений со смартфона в локальной сети (показ всплывающих уведомлений телефона на доске) — POST `/api/notify/send` + SSE `/api/notify/events` + `/notify.html`, проверено live
- [x] **Звуки уведомлений:** 10 встроенных примеров (`public/sounds/*.mp3`) + загрузка своих (карточка 🔊 `#w-sounds`, модуль `sounds.js`, `/api/sounds/list|upload|delete`); `/uploads/` отдаёт подкаталоги; справка (❓) переписана под новичка (акцент — перессылка уведомлений с телефона, `app.js:openGuide`)
- [x] Авто-подтяжка постеров: фоновая `prime()` — по одному фильму раз в 6 с, порядок `Без постера → не просмотренные → старые`; при добавлении — постановка в очередь сразу
- [x] **Игры:** вкладка 🎮 — библиотека Steam (список, постеры, ручное обновление) + сторонние игры, конфиг SteamId/API в конфиге
- [x] **Статистика сообщений:** вкладка 📨 — сколько уведомлений пришло, активных дней, в день (сводка из `notify`)
- [x] **YouTube:** вкладка ▶ — поиск, постер, стрим с сервера (yt-dlp), авторизация (cookies/браузер), история просмотра и подборки по интересам (`/js/interests.js`)
- [x] **Cookies → Интересы:** вкладка 🎯 — импорт истории браузера (поисковые запросы + просмотренное на YouTube) с прогресс-баром и живым логом, проверка факта импорта (`verify`), авто-темы из запросов/просмотров, «портрет человека» (`/js/components/cookies.js`); cookies больше не влияют на интересы (фикс ложных тегов вроде «Спорт» из подстроки `nba` внутри `kanban`)
- [x] **Глобальный зум интерфейса:** Ctrl+колесо, кнопки `−/1:1/+`, сохранение в `localStorage`, корректные drag/resize под любым зумом, координатная модель и регрессия (см. раздел выше)
- [x] **Умный дом, этап 1:** LAN-скан (ping + TCP + fingerprint), устройства с последним состоянием, опрос → diff → события (SSE), сценарии, панель UI, CLI для ИИ, ключ `KANBAN_SMART_KEY` (см. раздел выше). Этап 2 — Glagol-адаптер станции (локальный WS), этап 3 — Tuya/Yandex cloud/голос
- [x] **Обучение (вкладка 📚 «Курс»):** чтение курса `kurs/` в браузере — свой md-рендерер (код с копированием, таблицы, task-списки, картинки с лайтбоксом, `<details>`), оглавление с поиском, prev/next, якоря, персистентность последней главы; модуль `course.js` + `/api/course/{list,file,img}` (whitelist путей), стили `.course-*` (см. раздел «Обучение»)
- [x] **Песочница (вкладка 🧪):** Python/Node/Bash с таймаутом, лимитами и изоляцией bwrap, fallback без изоляции; модуль `sandbox.js`, UI `/js/components/sandbox.js` (см. раздел «Песочница»)
- [x] **GitHub (вкладка 🐙):** публичные репозитории + локальные проекты, поиск/сортировка, кеш 10 мин; модуль `gh.js`, UI `/js/components/github-view.js` (см. раздел «GitHub»)
- [x] **Обновление (настройки 🔄):** `git fetch/pull --ff-only`, список коммитов, dirty-проверка, рестарт сервиса, ключ `KANBAN_UPDATE_KEY`; модуль `updater.js` (см. раздел «Обновление»)
- [x] **Скрытие панелей (настройки 🧩):** чекбоксы панелей дашборда, `localStorage['nb-hidden-panels']`, `.panel-hidden`; `dash.js` + `app.js`
- [x] **Интересы с истории устройства:** desktop — `preload.js` + IPC + `history-collect.py` (Chrome/Firefox, без cookies); web — импорт `.txt/.json/.html` и `POST /api/interests/apply-rows` (см. раздел выше)
- [x] **WIP-метка умного дома:** бейдж в заголовке `#smart-panel` и баннер в `SHELL` (`smart.js`), стили `.wip-badge`/`.sm-wip`

## Новости: открытые соц-источники (Telegram/VK)

Новостной модуль `news.js` умеет не только RSS: у источника есть `kind: 'rss'|'telegram'|'vk'` и `social: true`. Соц-новости попадают в те же категории/веса, но получают `rank`, `hot`, `views`, `forwards` и бейджи в UI.

- **Telegram** — только через мост `https://tg.i-c-a.su/rss/<channel>?limit=10` (прямые `t.me`/`telegram.me`/`telesco.pe` и RSSHub с этого хоста недоступны). Мост отдаёт `media:statistics` (`views`, `forwards`), но **банит за пачку параллельных запросов** (`429`, `retry-after`): соцсети обновляются последовательно, Telegram — с паузой 4 с. Кеш `data/news-social.json`, TTL 15 мин; при ошибке/429 — stale-кеш и `retryAt` +5 мин, чтобы не долбить мост.
- **VK** — публичный виджет `https://vk.com/widget_community.php?app=0&width=607&_ver=1&gid=<numeric>&mode=2&height=1200` (кодировка `windows-1251`, `mode=2`/`4`; screen name в `gid` не работает, VK API без токена даёт `error_code:15`). Рабочие numeric gid: Двач `22751485`, Mash `112510789`, Baza `176841276`, Лентач `29534144`. VK-посты часто без просмотров/репостов — они сортируются по свежести.
- **Источники по умолчанию:** Двач TG + VK, Mash (VK), SHOT (TG), Baza (VK), Readovka (TG), Лентач (VK), Небрехня, Meduza, Агентство, BBC Рус (TG). `kp`/`truekpru` отдаёт `USERNAME_INVALID` — не добавлять.
- **Фильтр шлака:** `JUNK_RE` (реклама, промокоды, букмекеры/казино, микрозаймы, 18+, розыгрыши, астрология), `BET_RE` («ставки на спорт») + `SHORT_LINK_RE`. Короткие посты/подписи пропускаются только при `views >= 50000` или `forwards >= 300` (совсем короткие — при 20000/200).
- **Ранжирование:** соцсети — `log10(views)` + `log10(forwards)` + свежесть; RSS — свежесть. На категорию — сначала по одной новости с источника, затем по второй (`pickItems`), чтобы один канал не занимал весь отдел. `hot = views >= 50000 || forwards >= 500 || rank >= 35`.
- **Категоризация:** learned-слова из оценок теперь только усиливают категорию при совпадении хотя бы одного базового слова; иначе мусорные слова вроде «назвал»/«российских» утаскивали новости в «Космос»/«Авто». Соц-новости категоризуются без learned (`categorize(text, true)`).
- **UI:** `public/js/news.js` — `SRC_BADGE` (`🔥`, `TG`, `VK`, `🏛`, `🌐`), `fmtViews` (`👁 12.3K`, `↗ 1.2K`), настройки источников показывают `kind/social`.
- **Тест:** `/tmp/opencode/news-social-test.js` — временный `dataDir`, `/api/news` + `/api/news/sources`, печатает категории, бейджи и кеш; при 429 у моста ждать `retry-after` (не запускать подряд).

## Оптимизации и заметки

- `server.js` — монолит; модули `movies.js`/`news.js` вынесены — держать новые фичи в модулях, а не в server.js.
- Не хранить тяжёлое в git: `config.json` (секреты), `data/`, `ssl/`, `uploads/`, `stt/whisper-tiny/`, `*.onnx`, `dist/`, `node_modules/`.
- Telegram API недоступен с этого хоста (RU DPI): работает только через `HTTPS_PROXY`/`ALL_PROXY` (CONNECT) или зеркало `TELEGRAM_API_BASE`.
- Постеры: основной источник — Bing Images (`murl` из HTML); фолбэк — ИИ-резолвер через opencode (websearch). Yandex.Images отдаёт пустые результаты боту.
- Новости: RIA/ТАСС/Хабр/NASA отвечают 200; Лента/Ъ — редирект (fetch `redirect:'follow'`); space.com кормит `/feeds/all`. Категории: ключевые слова (`политика/техника/игры/космос/авто/прочее`), авто по умолчанию не показывается (пользователь не интересуется).
- Секреты (sudo-пароль, GitHub PAT, Telegram-токен) НЕ помещать в файлы и не логировать.

## Системные требования для запуска

- Web: Node.js ≥ 18 (глобальный fetch), Python 3 + faster-whisper + torch (STT), piper TTS-модель (data/tts). ОС: Linux. Дефолт Москва (timezone). Подключение к интернету.
- Desktop Linux: Electron + то же самое; AppImage собирается на Linux.
- Desktop Windows: Electron; STT-модель скачивается скриптом `скачать-модели.sh`/инструкцией `СОБРАТЬ.txt`.
- Микрофон/wake-слова: безопасный контекст — `http://localhost` (HTTP) или https с установленным сертификатом. Скриншоты работают только на X11 (не Wayland).

## Правила работы

- Отвечать по-русски, кратко. Не логировать секреты. Не коммитить без явного запроса.
- После правки синхрон. файлов — прогнать `node --check` и перезапустить `kanban-board`.