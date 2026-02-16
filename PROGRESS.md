# LL Trivia Study App v2 — Build Progress

**Last Updated:** 2026-02-15

---

## Project Overview

Ground-up rebuild of the LearnedLeague trivia study app as a React SPA + Flask API backend. Dark editorial design system inspired by the Quiz Bowl Training Playbook.

---

## Architecture

```
ll-trivia/
├── backend/          Flask JSON API + SQLAlchemy + Alembic
│   ├── app.py        ~1070 lines, 30+ endpoints at /api/v1/
│   ├── models.py     10 tables (Question, StudyProgress, StudySession, etc.)
│   ├── scraper.py    LL scraper with retry/backoff
│   ├── config.py     Environment-based config
│   └── migrations/   2 migrations (initial schema + is_ai_generated)
├── frontend/         React 19 + Vite + Recharts
│   └── src/
│       ├── App.jsx           Router + sidebar nav + ToastProvider
│       ├── api/client.js     API client (30+ exports)
│       ├── components/       11 components
│       ├── context/          ToastContext
│       ├── hooks/            useToast
│       ├── pages/            5 pages
│       └── styles/           tokens.css + categories.js
└── scripts/          scrape_seasons.py, seed_db.py
```

**Build:** 678 modules, builds in ~2.6s

---

## Completed Phases

### Phase 1: Foundation & Data ✅
- [x] Project structure (backend/ + frontend/ + scripts/)
- [x] Flask JSON-only API with 27+ endpoints at `/api/v1/`
- [x] SQLAlchemy models: Question, StudyProgress, StudySession, SessionAnswer, Bookmark, QuestionNote, QuestionTag, DailyActivity, AIResponse, AppSettings
- [x] Alembic migrations (initial schema + is_ai_generated column)
- [x] React + Vite scaffold with React Router v6
- [x] Design system: tokens.css (CSS custom properties), categories.js (18 category colors)
- [x] Scraper adaptation with retry/backoff/resume
- [x] Seed scripts (scrape_seasons.py, seed_db.py)

### Phase 2: Core Study Experience ✅
- [x] **Dashboard** (461 lines) — hero section (streak/due/today), stat cards, category mastery grid (18 cards), quick actions, recent sessions
- [x] **Flashcard mode** — CSS 3D card flip, SM-2 spaced repetition (4-rating: Again/Hard/Good/Easy), adaptive intervals
- [x] **Quiz mode** — configurable count (10/20/50), timer (Unlimited/15s/30s/60s), Got It/Missed It scoring, QuizResults summary
- [x] **Category & difficulty filtering** — dropdowns + chip selectors
- [x] **Bookmarks, Notes, Tags** — per-question persistence via API
- [x] **Keyboard shortcuts** — Space (flip), 1-4 (rate), Y/X (quiz), S/Arrow (skip), B (bookmark), N (notes), L (learn more), ? (help)

### Phase 3: Analytics & AI ✅
- [x] **Stats page** (~1100 lines) — overview cards, accuracy trend ComposedChart (7/30/90d), GitHub-style SVG heatmap (365 days), category mastery grid, weakest questions table, session history with expandable answer review
- [x] **Revenge Match mode** — Nemesis Board (worst categories), focus targeting, "REVENGE MATCH" banner, Nemesis Report (defeated vs still standing)
- [x] **Category Deep Dive mode** — 18-category selector grid, questions sorted easiest-first, category completion bar, mastery summary with comparison
- [x] **LearnMore component** — 3 AI modes (Quick Explain / Deep Dive / Quiz Bowl), cached server-side, integrated into Flashcard back
- [x] **Session history** — backend endpoint GET /sessions/:id/answers, expandable rows in Stats

### Phase 4: Polish & Extras ✅
- [x] **Import page** (~700 lines) — live scraper with terminal-style progress log + ETA bar, manual question entry form (18 categories), export JSON/CSV
- [x] **Settings page** (~496 lines) — API config, study prefs, theme toggle (dark/light), keyboard shortcuts reference, data management with inline confirmations, about section
- [x] **Toast notifications** — ToastProvider context + useToast hook, slide-in animations, auto-dismiss with progress bar
- [x] **Theme toggle** — light mode CSS overrides in tokens.css, persisted to settings API
- [x] **Backend endpoints** — reset-progress, clear-ai-cache, manual question entry

### Stretch: AI Question Forge ✅
- [x] `is_ai_generated` column on Question model + Alembic migration
- [x] `POST /api/v1/ai/generate-questions` — Claude generates LL-style questions with difficulty estimates, saves to DB
- [x] **QuestionForge component** (~670 lines) — category grid (weak badges), difficulty/count selectors, animated loading state, results with hidden answers
- [x] "Forge" tab in Study page, "AI" badge on Flashcard for generated questions

---

## Components Built (11)

| Component | Lines | Description |
|-----------|-------|-------------|
| Flashcard.jsx | 367 | CSS 3D flip card with front/back, AI badge |
| QuestionForge.jsx | 670 | AI question generation with 3-phase UI |
| LearnMore.jsx | 321 | AI explanation panel with 3 modes |
| RatingButtons.jsx | 115 | Again/Hard/Good/Easy with keyboard badges |
| QuizTimer.jsx | 76 | Countdown bar with urgency states |
| QuizResults.jsx | 165 | End-of-quiz summary with category breakdown |
| ProgressBar.jsx | 56 | Thin bar with streak counter |
| NoteEditor.jsx | 109 | Expandable note textarea |
| TagManager.jsx | 138 | Tag pills with add/remove |
| KeyboardShortcutHelp.jsx | 136 | Modal shortcut overlay |
| ToastContext.jsx | 198 | Toast notification provider + container |

## Pages Built (5)

| Page | Lines | Description |
|------|-------|-------------|
| Dashboard.jsx | 461 | Stats overview, category grid, quick actions |
| Study.jsx | 1760 | 5 modes orchestration, filters, keyboard shortcuts |
| Stats.jsx | 1102 | Charts, heatmap, tables, session history |
| Import.jsx | 700 | Scraper, manual entry, export |
| Settings.jsx | 496 | Config, theme, shortcuts, data management |

---

## API Endpoints (30+)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /questions | Filtered question list |
| GET | /questions/:id | Single question with details |
| POST | /questions | Manual question entry |
| POST | /progress | Record study attempt (SM-2) |
| POST | /sessions | Create study session |
| PUT | /sessions/:id | Update session with answers |
| GET | /sessions | Session history |
| GET | /sessions/:id/answers | Session answer review |
| POST | /bookmarks/:id | Toggle bookmark |
| PUT | /questions/:id/notes | Save note |
| POST | /questions/:id/tags | Add tag |
| DELETE | /questions/:id/tags/:tag | Remove tag |
| GET | /stats/overview | Dashboard stats |
| GET | /stats/categories | Per-category mastery |
| GET | /stats/trends | Time-series accuracy |
| GET | /stats/heatmap | 365-day activity |
| GET | /stats/weakest | Lowest-accuracy questions |
| POST | /learn-more | AI explanation (3 modes, cached) |
| POST | /ai/generate-questions | AI question generation |
| POST | /import/scrape | Start background scrape |
| GET | /import/status | Scrape progress |
| GET | /export/json | Full data export |
| GET | /export/csv | Progress CSV export |
| GET | /settings | Get app settings |
| PUT | /settings | Update settings |
| POST | /data/reset-progress | Reset all progress |
| POST | /data/clear-ai-cache | Clear AI cache |

---

## Running the App

```bash
# Backend (Flask API on port 5000)
cd ll-trivia/backend
pip install -r requirements.txt
python -m flask --app app:create_app run --port 5000

# Frontend (Vite dev server on port 5173)
cd ll-trivia/frontend
npm install
npx vite --port 5173
```

Open `http://localhost:5173` in your browser.

---

## Remaining / Future Work

- [ ] Preload seasons 60+ (requires LL credentials to run scraper)
- [ ] Code-split Recharts to reduce bundle size (currently 769KB)
- [ ] Add tests (pytest backend, Vitest frontend)
- [ ] Add ESLint/Prettier/ruff linting
- [ ] Production build: Flask serves React dist
- [ ] Responsive mobile layout
