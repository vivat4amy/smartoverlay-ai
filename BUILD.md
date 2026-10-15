# Сборка SmartOverlay AI в .exe / .msi

## Что вы получите

- `SmartOverlay AI_0.1.0_x64_en-US.msi` — корпоративный MSI-инсталлер
- `SmartOverlay AI_0.1.0_x64-setup.exe` — обычный EXE-инсталлер (NSIS) с поддержкой русского и английского
- `smartoverlay-v2.exe` — один portable-EXE без установщика (внутри уже есть Python-backend как sidecar — отдельно поднимать uvicorn не нужно).

После установки приложение появится в меню «Пуск» как **SmartOverlay AI**, можно запускать как обычную Windows-программу.

## Что нужно установить ОДИН РАЗ

1. **Node.js 20+** → <https://nodejs.org/> (LTS-версия). Проверка: `node -v`.
2. **Rust + MSVC** → <https://www.rust-lang.org/tools/install>. Скачайте `rustup-init.exe`, запустите, нажмите Enter (default install). При вопросе про Visual Studio Build Tools — соглашайтесь, иначе линкер для Windows не встанет. Проверка: `cargo --version`.
3. **WebView2 Runtime** — на Windows 10 (1803+) и Windows 11 уже стоит. Если нет, скачайте «Evergreen Standalone Installer» с <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>.

После установки **перезапустите терминал**, чтобы PATH подхватил `cargo` и `node`.

## Сборка одной командой

Дважды кликните на **`build.bat`** в корне проекта. Скрипт:

1. Поставит npm-зависимости (если ещё не стояли).
2. Соберёт Python-backend через PyInstaller и положит sidecar в `src-tauri\binaries\`.
3. Соберёт фронтенд (`npm run build` → `dist/`).
4. Запустит `npm run tauri build` — Rust release, MSI и NSIS.

Готовые установщики — в `src-tauri\target\release\bundle\`. Готовый portable-EXE — `src-tauri\target\release\smartoverlay-v2.exe`.

**Обычный запуск после сборки:** двойной клик по **`SmartOverlay.bat`** (или сразу по `smartoverlay-v2.exe`). Пересборка не нужна.

**Только разработка** (горячая перезагрузка UI, внешний uvicorn): **`dev.bat`**.

Если запускаете вручную:

```powershell
cd C:\Projects\smartoverlay-v2
npm install
npm run tauri build
```

## Установка собранного

Запустите `*-setup.exe` или `*.msi` двойным кликом → Next → Install. По умолчанию ставится только для текущего пользователя (`%LOCALAPPDATA%\Programs\SmartOverlay AI\`), без прав администратора.

После установки в меню «Пуск» появится `SmartOverlay AI`. Кликнули — открылся прозрачный overlay в углу + фоновая иконка в трее.

## Запуск из исходников без полной пересборки

| Файл | Назначение |
|------|------------|
| **`SmartOverlay.bat`** | Если уже есть `target\release\smartoverlay-v2.exe` — запускает его (backend внутри). Иначе предлагает `build.bat` и переключается на **`dev.bat`**. |
| **`dev.bat`** | Режим разработки: `uvicorn` из `backend\venv` + `npm run tauri dev`. |

Отдельный `run-installed.bat` не нужен: второй раз поднимать Python только для релизного exe нельзя — займёт тот же порт `18321`.

## Версия и подпись

Версия `0.1.0` берётся из `tauri.conf.json` → `version`. Поднимите её при следующих сборках, чтобы Windows предлагал обновление.

Подписи кода у установщика нет — Windows SmartScreen может ругаться при первом запуске («Неизвестный издатель»). Это нормально для self-built проекта; нажмите «Подробнее → Выполнить в любом случае». Чтобы убрать предупреждение — нужен платный code-signing сертификат (~$70/год от Sectigo) и `signtool sign /a *.msi`. Это уже задача отдельной итерации.

## Если сборка падает

| Ошибка | Причина и фикс |
|---|---|
| `error: linker 'link.exe' not found` | Не установлен MSVC. Запустите `rustup default stable-x86_64-pc-windows-msvc` и поставьте Visual Studio Build Tools 2022 (workload «Desktop development with C++»). |
| `Could not compile webview2-com-sys` | Антивирус блокирует. Добавьте папку проекта в исключения, перезапустите. |
| `failed to download from registry.npmjs.org` | Нет интернета или прокси. Проверьте `npm config get registry` и доступ. |
| `wix toolset not found` | Tauri скачает WiX автоматически при первой сборке. Если не выходит — ручная установка <https://wixtoolset.org/releases/>. |
| `Permission denied` на `target\release\` | Закройте предыдущий запущенный SmartOverlay (он держит exe). |
