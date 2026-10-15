# SmartOverlay AI v2 — локальная версия (Ollama)

> Вариант с полностью локальным AI через Ollama: без платных API, данные не покидают компьютер.
> Облачный вариант на OpenAI GPT-4o: [smartoverlay-ai-gpt](https://github.com/vivat4amy/smartoverlay-ai-gpt).

Десктопный оверлей с AI-анализом экрана. Распознаёт контент, ищет музыку, игры, фильмы, людей, группирует интересы и даёт персонализированные рекомендации.

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Десктоп-оболочка | Tauri v2 (Rust) |
| UI фронтенд | React 19 + TypeScript + Vite |
| Стили | Tailwind CSS 4 |
| State management | Zustand |
| AI-бэкенд | FastAPI (Python) |
| Vision AI | Mock / CLIP / GPT-4o Vision / Hybrid |
| Поиск контента | iTunes, RAWG, TMDb, Wikidata API |
| База данных | SQLite + SQLAlchemy async |
| Коммуникация | WebSocket (real-time) |

## Быстрый старт

### Требования

- Node.js 20+
- Rust 1.70+ (с MSVC на Windows)
- Python 3.11+
- Windows 10/11

### Установка

```bash
# 1. Фронтенд
cd smartoverlay-ai
npm install

# 2. Бэкенд
cd backend
python -m venv venv
.\venv\Scripts\activate    # Windows
pip install -r requirements.txt

# 3. Настройка
cp .env.example .env
# Отредактируйте .env — добавьте API ключи при необходимости
```

### Запуск (разработка)

```bash
# Терминал 1 — бэкенд
cd backend
.\venv\Scripts\activate
uvicorn app.main:app --host 127.0.0.1 --port 18321 --reload

# Терминал 2 — Tauri + React
cd smartoverlay-ai
npm run tauri dev
```

### Горячие клавиши

| Комбинация | Действие |
|-----------|---------|
| `Ctrl+Alt+S` | Анализировать экран |
| `Ctrl+Alt+D` | Открыть/скрыть панель управления |

## Архитектура

```
Tauri (Rust)          React (TypeScript)       FastAPI (Python)
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Screen       │────▶│ Overlay Window   │     │ Vision API      │
│ Capture      │     │ (transparent)    │◀───▶│ Search API      │
│ Hotkeys      │     │                  │ WS  │ Recommendations │
│ System Tray  │     │ Dashboard Window │◀───▶│ Interests       │
│              │     │ (личный кабинет) │REST │ User Settings   │
└──────────────┘     └──────────────────┘     └─────────────────┘
```

## Vision провайдеры

| Провайдер | Описание | Стоимость |
|----------|---------|----------|
| `mock` | Моковые данные для разработки | Бесплатно |
| `clip` | Локальная классификация OpenCLIP | Бесплатно |
| `gpt4o` | Облачный анализ GPT-4o Vision | ~$0.02/запрос |
| `hybrid` | CLIP постоянно + GPT-4o при смене контекста | Минимальная |

Переключение провайдера — через `VISION_PROVIDER` в `.env` или в настройках дашборда.

## API ключи (опциональные)

| Сервис | Где получить | Для чего |
|--------|-------------|---------|
| OpenAI | platform.openai.com | GPT-4o Vision анализ |
| RAWG | rawg.io/apidocs | Поиск игр |
| TMDb | themoviedb.org | Поиск фильмов/сериалов |

Музыка (iTunes) и люди (Wikidata) работают без ключей.

## Лицензия

MIT
