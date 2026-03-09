# Japan Disaster Alert

A multilingual disaster information system for Japan, providing real-time earthquake, weather, and emergency alerts to foreign residents and tourists in 16 languages.

## Features

- **Real-time Earthquake Data** — Live feeds from P2P earthquake network with intensity maps
- **SSE Real-time Streaming** — Server-Sent Events for instant disaster updates with polling fallback
- **JMA Weather Alerts** — Prefecture-level weather warnings via Japan Meteorological Agency API
- **16-Language Support** — Covers the top 10 tourist-origin countries visiting Japan (2024), plus residents
- **Hybrid Translation Engine** — Three-layer approach: static location mapping → AI translation (Gemini/Claude) → DB-backed cache
- **Regional Notifications** — Prefecture-based push notification preferences with earthquake threshold filtering
- **Shelter Finder** — Nearby evacuation shelter search based on current location
- **Dark Mode** — Light / Dark / System theme with persistent preference and FOUT prevention
- **PWA Ready** — Offline support via Service Worker with installable manifest
- **Rate-Limited API** — Per-endpoint rate limiting to protect public data sources
- **Comprehensive Testing** — 125+ tests (Vitest unit, Playwright E2E, pytest backend)

## Supported Languages

| Code | Language | Region |
|------|----------|--------|
| `ja` | 日本語 | Japan |
| `en` | English | US / Australia / Europe |
| `ko` | 한국어 | Korea |
| `zh` | 简体中文 | China |
| `zh-TW` | 繁體中文 | Taiwan / Hong Kong |
| `th` | ภาษาไทย | Thailand |
| `ms` | Bahasa Melayu | Malaysia |
| `id` | Bahasa Indonesia | Indonesia |
| `tl` | Filipino | Philippines |
| `vi` | Tiếng Việt | Vietnam |
| `fr` | Français | France |
| `de` | Deutsch | Germany |
| `it` | Italiano | Italy |
| `es` | Español | Spain |
| `ne` | नेपाली | Nepal |
| `easy_ja` | やさしい日本語 | Japanese learners |

## Tech Stack

### Backend
- **Python 3.11+** with **FastAPI** and **Uvicorn**
- **SQLAlchemy (async)** + **aiosqlite** — async database (PostgreSQL-ready)
- **httpx** — async HTTP client for JMA and P2P APIs
- **slowapi** — per-route rate limiting
- **pywebpush** — Web Push notifications (VAPID)
- **python-json-logger** — structured JSON logging (production)
- **pydantic-settings** — environment-based configuration
- **Gemini API / Claude API** — AI-powered translation fallback (optional)

### Frontend
- **Next.js 15** with **React 19** and **TypeScript**
- **Tailwind CSS** — utility-first styling with dark mode (`class` strategy)
- **Leaflet / react-leaflet** — interactive maps
- **Vitest** + **React Testing Library** — unit testing (59 tests)
- **Playwright** — E2E testing (28 tests)
- **PWA** — Service Worker for offline capability

### Data Sources
- [Japan Meteorological Agency (JMA)](https://www.data.jma.go.jp/developer/index.html)
- [P2P Earthquake Network API](https://www.p2pquake.net/)

## Getting Started

### Prerequisites

- Python 3.11 or higher
- Node.js 18 or higher
- npm

### 1. Clone the repository

```bash
git clone https://github.com/TTMK7777/Japan-Disaster-Alert-v2.git
cd Japan-Disaster-Alert-v2
```

### 2. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # Edit .env with your settings
python run.py
```

Backend starts at http://localhost:8000
API docs available at http://localhost:8000/docs

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at http://localhost:3001

### 4. Start both services at once (optional)

```bash
chmod +x scripts/start_dev.sh
./scripts/start_dev.sh
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in the values:

| Variable | Description | Required |
|----------|-------------|----------|
| `ENVIRONMENT` | Runtime environment (`development` / `production`) | No |
| `LOG_LEVEL` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) | No |
| `API_TIMEOUT` | External API request timeout in seconds | No |
| `AI_PROVIDER` | AI provider to use (`auto`, `gemini`, `claude`) | No |
| `GEMINI_API_KEY` | Google Gemini API key (get from [Google AI Studio](https://aistudio.google.com/apikey)) | Optional |
| `GEMINI_MODEL` | Gemini model name | No |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (get from [Anthropic Console](https://console.anthropic.com/)) | Optional |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | No |
| `VAPID_PUBLIC_KEY` | VAPID public key for Web Push notifications | Optional |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push notifications | Optional |
| `VAPID_CLAIMS_EMAIL` | Contact email for VAPID claims | Optional |
| `SHELTER_CSV_PATH` | Path to GSI shelter CSV file | Optional |
| `HOST` | Server bind address | No |
| `PORT` | Server port | No |
| `DATABASE_URL` | Database URL (default: SQLite in `data/app.db`) | No |
| `NEXT_PUBLIC_API_URL` | Backend URL used by the frontend | No |

> AI API keys are fully optional. The system works without them using the built-in static location translation table (75 locations x 15 languages).

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/v1/earthquakes` | GET | Latest earthquake data |
| `/api/v1/weather/{area_code}` | GET | Weather info by prefecture code |
| `/api/v1/alerts` | GET | Active weather warnings |
| `/api/v1/translate` | POST | Text translation |
| `/api/v1/shelters` | GET | Nearby evacuation shelters |
| `/api/v1/tsunami` | GET | Tsunami alert information |
| `/api/v1/volcanoes` | GET | Volcano warning information |
| `/api/v1/safety-guide` | GET | AI-generated safety guide |
| `/api/v1/languages` | GET | Supported language list |
| `/api/v1/push/subscribe` | POST | Register push notification subscription |
| `/api/v1/push/unsubscribe` | POST | Remove push notification subscription |
| `/api/v1/push/test` | POST | Send test notification (dev only) |
| `/api/v1/push/preferences` | PUT | Update notification preferences |
| `/api/v1/push/preferences/query` | POST | Query notification preferences |
| `/api/v1/regions` | GET | Available prefecture region codes |
| `/api/v1/events/stream` | GET | SSE real-time event stream |

**Common query parameters:**
- `lang` — language code (e.g., `en`, `ko`, `zh`)
- `limit` — number of results to return

## Project Structure

```
Japan-Disaster-Alert-v2/
├── backend/
│   ├── app/
│   │   ├── main.py                       # FastAPI application entry point
│   │   ├── models.py                     # Pydantic data models
│   │   ├── config.py                     # Environment-based settings
│   │   ├── exceptions.py                 # Custom exception classes
│   │   ├── database.py                   # Async SQLAlchemy engine/session
│   │   ├── db_models.py                  # SQLAlchemy table definitions
│   │   ├── services/
│   │   │   ├── jma_service.py            # JMA weather API integration
│   │   │   ├── p2p_service.py            # P2P earthquake API integration
│   │   │   ├── event_manager.py          # SSE event management & broadcasting
│   │   │   ├── translator.py             # Translation service (facade)
│   │   │   ├── ai_provider.py            # AI API integration (Gemini/Claude)
│   │   │   ├── translation_cache.py      # DB-backed translation cache (L1 mem + L2 DB)
│   │   │   ├── translation_templates.py  # Static multilingual templates
│   │   │   ├── safety_guide.py           # AI safety guide generation
│   │   │   ├── location_translations.py  # Static location name translations
│   │   │   ├── shelter_service.py        # Evacuation shelter lookup (CSV/JSON)
│   │   │   ├── push_service.py           # Web Push + regional notifications (DB-backed)
│   │   │   ├── tsunami_service.py        # Tsunami alert service
│   │   │   ├── volcano_service.py        # Volcano alert service
│   │   │   └── warning_service.py        # General warning aggregation
│   │   └── utils/
│   │       ├── area_codes.py             # JMA area code mapping
│   │       ├── error_handler.py          # Unified error handling
│   │       └── logger.py                 # Structured JSON logging
│   ├── tests/
│   ├── requirements.txt
│   ├── run.py
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/                          # Next.js App Router pages
│   │   ├── components/                   # React components
│   │   │   └── __tests__/               # Vitest unit tests (59 tests)
│   │   ├── hooks/                        # Custom React hooks (useEventStream, useTheme)
│   │   ├── config/                       # API configuration
│   │   ├── i18n/                         # Translation strings (16 languages)
│   │   ├── test/                         # Test setup (Vitest)
│   │   └── types/                        # TypeScript type definitions
│   ├── e2e/                              # Playwright E2E tests (28 tests)
│   ├── public/
│   │   ├── sw.js                         # Service Worker
│   │   └── manifest.json                 # PWA manifest
│   └── package.json
├── docs/
├── scripts/
│   └── start_dev.sh
└── LICENSE
```

## Running Tests

### Backend (pytest)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -v     # 38 tests
```

### Frontend (Vitest)

```bash
cd frontend
npm install
npx vitest run       # 59 unit tests
```

### E2E (Playwright)

```bash
cd frontend
npx playwright install chromium
npx playwright test   # 28 E2E tests
```

## Disclaimer

This system provides reference information only and is **not** a substitute for official disaster information. During emergencies, always follow announcements from the Japan Meteorological Agency and your local government.

## License

[MIT License](LICENSE)
