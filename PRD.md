# Product Requirements Document: LL Trivia Study App v2

**Author:** Don
**Date:** 2026-02-15
**Status:** Draft

---

## 1. Executive Summary

A ground-up rebuild of the LearnedLeague trivia study application as a **React SPA** backed by a Flask API. The app helps users study LL trivia questions using spaced repetition, timed quiz sessions, and AI-powered explanations. The visual design draws heavily from the **Quiz Bowl Training Playbook** — a dark, editorial aesthetic using `Crimson Text` / `Courier New` typography, monochrome palette with per-category accent colors, grid-based card layouts, and subtle hover/transition effects.

The v2 app ships with **all LL questions from season 60 onward preloaded** (~10,000+ questions), eliminating the need for users to scrape on first run.

---

## 2. Current State

### What Exists Today
- Flask backend serving Jinja2 templates + vanilla JS frontend
- SQLite database with two tables (Question, StudyProgress)
- Web scraper for importing questions from LearnedLeague (authenticated)
- Flashcard-style study interface with category/difficulty/mode filters
- Basic spaced repetition (3-tier: 1/3/7 day intervals)
- Claude API "Learn More" feature for contextual explanations
- Stats dashboard with category accuracy and confidence breakdown
- Dark theme UI, keyboard shortcuts (Space, 1/2/3, S/Arrow)
- ~900 bundled seed questions in `questions_data.json` (small subset)

### Known Limitations
- No tests, no linter, no CI
- Spaced repetition algorithm is simplistic (3 fixed intervals, no adaptive scheduling)
- No session/quiz mode — study is open-ended card flipping
- No way to bookmark, flag, or annotate questions
- Stats are read-only with no historical trend tracking
- Scraper is fragile to LL HTML changes with no fallback
- Threading model for background scraping is basic (daemon thread, global dict)
- No data export/backup capability
- Frontend is vanilla JS with no component structure — can't scale to the feature set we want

---

## 3. Goals & Non-Goals

### Goals
1. **React SPA frontend** styled after the Quiz Bowl Training Playbook's design language
2. **Preloaded question bank** — scrape and bundle all seasons 60+ before launch (no first-run scrape required)
3. **Game-inspired study modes** — draw from the playbook's 6 training techniques (Pyramid Descent, Canon Cascade, Revenge Match, etc.) adapted for LL content
4. **Smarter spaced repetition** — SM-2 or FSRS algorithm with adaptive scheduling
5. **Rich question interaction** — bookmarks, personal notes, custom tags
6. **Performance analytics** — streaks, accuracy trends, category mastery heatmap
7. **Flask API backend** — clean JSON API serving the React frontend, with the scraper preserved for future season imports

### Non-Goals
- Multi-user / authentication system (this remains a personal tool)
- Mobile native app (responsive web is sufficient)
- Real-time multiplayer trivia
- Monetization or public hosting
- Rebuilding the scraper from scratch (improve resilience, keep core logic)

---

## 4. Design System (from Quiz Bowl Training Playbook)

The playbook establishes the visual language for the entire app. Key design tokens:

### 4.1 Color Palette

```
Background:     #0A0A0F
Surface/Card:   #12121A
Card Hover:     #1A1A25
Text Primary:   #E8E6E3
Text Muted:     #8B8994
Border:         #2A2A35
```

**Per-category accent colors** (mapped to LL's 18 categories):

| Category | Primary | Accent |
|----------|---------|--------|
| AMER HIST | #E85D04 | #FFBA08 |
| WORLD HIST | #D00000 | #FF6B6B |
| SCIENCE | #0077B6 | #48CAE4 |
| LITERATURE | #7B2CBF | #C77DFF |
| ART | #2D6A4F | #52B788 |
| GEOGRAPHY | #3A0CA3 | #7209B7 |
| ... | (assign remaining 12) | |

### 4.2 Typography

- **Headlines / Body**: `'Crimson Text', 'Georgia', serif`
- **Labels / Mono UI**: `'Courier New', monospace`
- Labels use `letter-spacing: 3-6px`, `text-transform: uppercase`, `font-size: 10-12px`
- Body text at `14-16px` with `line-height: 1.6-1.8`

### 4.3 Component Patterns (from playbook)

- **Card grid**: `repeat(auto-fit, minmax(260px, 1fr))` with `gap: 16px`
- **Colored left border** on cards: `border-left: 3px solid {category.color}`
- **Hover states**: background shift to `cardHover` + border glow `{color}40`
- **Tab switcher**: pill-style tabs inside a bordered container with active highlight `{color}25`
- **Section headers**: monospace, 11px, uppercase, letter-spacing 3px, muted color
- **Detail panels**: colored background `{color}12` with matching border `{color}30`
- **Progress/phase indicators**: numbered steps `"01 —"` style with `#FFBA08` accent
- **Back navigation**: minimal text button `← All Techniques` style
- **Subtle grid background**: fixed position CSS linear-gradient grid overlay at 0.015 opacity

### 4.4 Animations & Transitions

- All interactive elements: `transition: all 0.25s ease`
- Card flip: CSS `backface-visibility` with `transform: rotateY(180deg)`
- Hover opacity shifts on navigation buttons (0.6 → 1.0)
- Toast notifications: slide-in from top-right

---

## 5. Feature Requirements

### 5.1 Preloaded Question Bank

#### 5.1.1 One-Time Scrape (Pre-Build)
- Run the existing scraper against **seasons 60 through current** (~100 seasons × 25 match days × 6 questions = ~15,000 questions)
- Output to a `questions_data.json` seed file (or split by season: `data/season_60.json`, etc.)
- Include all fields: season, match_day, question_number, question_text, answer, category, percent_correct

#### 5.1.2 Seed on First Run
- On first launch with empty DB, load the bundled JSON into SQLite
- Show a one-time loading screen with progress (e.g., "Loading 14,832 questions...")
- Subsequent launches skip this step (check if questions table is populated)

#### 5.1.3 Incremental Import (Keep Scraper)
- Preserve the import page for scraping new/future seasons
- Add "Check for new seasons" button that detects the latest available season and scrapes only what's missing
- Improve scraper resilience: retry with exponential backoff, resume interrupted scrapes, detect HTML changes gracefully

### 5.2 Study Modes

Inspired by the 6 playbook techniques, adapted for LearnedLeague content:

#### 5.2.1 Flashcard Review (Canon Cascade)
- Default study mode — flip-card UX with spaced repetition scheduling
- Filter by category, difficulty, study mode (review due / unseen / all / bookmarked)
- **4-rating scale**: Again (reset), Hard (1 day), Good (interval × EF), Easy (interval × EF × 1.3)
- Show next review date after rating
- Streak counter (consecutive correct), undo last rating
- "Show Hint" — reveals category or first letter of answer

#### 5.2.2 Quiz Mode (Season Mode)
- Timed quiz sessions: configurable question count (10 / 20 / 50)
- Optional per-question timer (15s / 30s / 60s / unlimited)
- Multiple-choice or free-recall answer format
- End-of-session results: score, accuracy by category, time stats
- Session history persisted to DB with full answer log

#### 5.2.3 Revenge Match
- Pulls exclusively from previously-missed questions
- Questions re-presented with new context: "Learn More" panel, related questions
- Graduated probation: get it right → returns in 1 week; right again → cleared
- "Nemesis Board" — most-missed categories and specific questions

#### 5.2.4 Category Deep Dive
- Select one category → all questions in that category sorted by difficulty (easiest first)
- Progress bar showing category completion percentage
- At end: category mastery score with comparison to overall average

### 5.3 Question Interaction

#### 5.3.1 Bookmarks & Flags
- Bookmark icon on every card (persisted to DB)
- Dedicated "Bookmarked" filter in flashcard mode
- Flag questions as broken/incorrect for personal review

#### 5.3.2 Personal Notes
- Expandable text area on card back for free-text notes
- Notes persist to DB, display on subsequent reviews
- Markdown-lite support (bold, italic, links)

#### 5.3.3 Custom Tags
- User-defined tags beyond LL categories (e.g., "rivers", "pre-1900", "stumped-me")
- Tags are filterable in all study modes
- Tag management page (rename, merge, delete)

### 5.4 Analytics & Tracking

#### 5.4.1 Study Streaks
- Track daily activity (at least 1 question studied = active day)
- Dashboard displays: current streak, longest streak, total study days
- **Calendar heatmap** (GitHub contribution graph style) — darker = more questions studied

#### 5.4.2 Performance Trends
- Line chart: weekly accuracy trend (overall and per-category)
- Bar chart: questions studied per day/week
- Per-category accuracy over time to visualize improvement

#### 5.4.3 Stats Dashboard
- **Category mastery grid**: 18-cell grid showing mastery % per category with color coding
- **Weakest questions**: list of lowest-accuracy individual questions with "Practice" links
- **Confidence distribution**: visual breakdown of Again/Hard/Good/Easy ratings
- **Mastery meter**: overall % of questions at mastered status

### 5.5 AI Features

#### 5.5.1 Enhanced Learn More
- Cache AI responses in DB (`AIResponse` table) — never call Claude twice for the same question+mode
- **Three explanation modes**:
  - "Quick Explain" — 2-3 sentence summary
  - "Deep Dive" — multi-paragraph with historical/scientific context
  - "Quiz Bowl Angle" — what clues point to this answer, related tossup patterns (from playbook's pyramidal technique)
- Show related questions from the DB after explanation

#### 5.5.2 AI Quiz Generation (Stretch)
- Generate practice questions on weak categories using Claude
- Mark AI-generated questions distinctly from real LL questions
- Use playbook's "Question Forge" concept: Claude generates pyramidal clue sets

### 5.6 UI Pages & Navigation

#### 5.6.1 App Shell
- React Router with 5 main routes: Dashboard, Study, Stats, Import, Settings
- Persistent sidebar or top nav with active state indicators
- Playbook-style navigation: monospace labels, subtle borders, category-colored active states

#### 5.6.2 Dashboard (`/`)
- **Hero section**: current streak (flame icon), due for review count, daily goal progress
- **Quick actions**: "Review Due" (primary), "Quick Quiz", "Revenge Match", "Continue Last Session"
- **Category mastery grid**: 18-card grid, each showing category name + mastery % + accent color bar
- **Recent activity**: last 5 study sessions with date, mode, score
- **Overview cards**: total questions, questions studied, overall accuracy

#### 5.6.3 Study Page (`/study`)
- **Mode selector**: tabs/pills for Flashcard, Quiz, Revenge Match, Category Deep Dive
- **Filter sidebar**: category, difficulty, tags, question count
- **Card area**: full-width flashcard with flip animation, rating buttons, bookmark/note controls
- **Progress bar**: "12 / 20" with visual bar, streak indicator

#### 5.6.4 Stats Page (`/stats`)
- **Trend charts**: accuracy over time (line), questions per day (bar)
- **Category mastery grid** (shared component with dashboard, but larger/detailed)
- **Weakest questions table**: sortable by accuracy, category, times seen
- **Calendar heatmap**: 365-day activity visualization
- **Session history table**: date, mode, score, duration — click to review answers

#### 5.6.5 Import Page (`/import`)
- **Status banner**: "14,832 questions loaded (seasons 60–102)" with last sync date
- **Scrape form**: start/end season, credentials, progress log with ETA
- **Manual add**: form for custom questions
- **Export/Backup**: buttons for JSON export, CSV export, DB backup download

#### 5.6.6 Settings Page (`/settings`)
- API key configuration (Anthropic, LL credentials)
- Study preferences: default question count, timer settings, daily goal
- Theme toggle (dark default, light option)
- Data management: reset progress, clear AI cache, delete database
- Keyboard shortcut reference

---

## 6. Technical Architecture

### 6.1 Project Structure

```
ll-trivia/
├── backend/
│   ├── app.py                # Flask app factory + API routes
│   ├── models.py             # SQLAlchemy models
│   ├── scraper.py            # LL scraper (improved)
│   ├── config.py             # Configuration
│   ├── requirements.txt
│   └── data/
│       └── questions_seed.json   # Preloaded seasons 60+
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/              # API client functions
│       ├── components/       # Shared components (Card, Button, etc.)
│       ├── pages/            # Dashboard, Study, Stats, Import, Settings
│       ├── hooks/            # useQuestions, useStudySession, etc.
│       ├── context/          # ThemeContext, StudyContext
│       └── styles/           # Global CSS + design tokens
└── scripts/
    ├── scrape_seasons.py     # One-time scrape script for preloading
    └── seed_db.py            # Load JSON into SQLite
```

### 6.2 Backend (Flask API)

| Area | Approach |
|------|----------|
| Framework | Flask (keep — proven, simple, sufficient for single-user) |
| ORM | Flask-SQLAlchemy |
| Database | SQLite + Alembic migrations |
| Background tasks | `threading.Thread` (keep for scraper — simple, works for single-user) |
| API design | JSON-only API at `/api/v1/` — no HTML rendering |
| CORS | flask-cors for local dev (Vite dev server on :5173, Flask on :5000) |

**API Endpoints**:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/questions` | Filtered question list (category, difficulty, mode, limit) |
| GET | `/api/v1/questions/:id` | Single question with progress + notes |
| POST | `/api/v1/progress` | Record study attempt (question_id, confidence) |
| POST | `/api/v1/sessions` | Start a new study/quiz session |
| PUT | `/api/v1/sessions/:id` | Update session (add answers, complete) |
| GET | `/api/v1/sessions` | Session history |
| POST | `/api/v1/bookmarks/:question_id` | Toggle bookmark |
| PUT | `/api/v1/questions/:id/notes` | Save note for question |
| POST | `/api/v1/questions/:id/tags` | Add tag to question |
| DELETE | `/api/v1/questions/:id/tags/:tag` | Remove tag |
| GET | `/api/v1/stats/overview` | Dashboard stats (streak, due count, totals) |
| GET | `/api/v1/stats/categories` | Per-category accuracy and mastery |
| GET | `/api/v1/stats/trends` | Time-series accuracy and activity data |
| GET | `/api/v1/stats/heatmap` | Daily activity for calendar heatmap |
| GET | `/api/v1/stats/weakest` | Lowest-accuracy questions |
| POST | `/api/v1/learn-more` | Claude AI explanation (cached) |
| POST | `/api/v1/import/scrape` | Start background scrape |
| GET | `/api/v1/import/status` | Scrape progress |
| GET | `/api/v1/export/json` | Full data export |
| GET | `/api/v1/export/csv` | Progress CSV export |
| GET | `/api/v1/settings` | Get app settings |
| PUT | `/api/v1/settings` | Update app settings |

### 6.3 Database Schema

**Existing (modified):**

```sql
Question (
  id, season, match_day, question_number,
  question_text, answer, category, percent_correct,
  created_at,
  UNIQUE(season, match_day, question_number)
)

StudyProgress (
  id, question_id FK,
  times_seen, times_correct,
  confidence,                    -- last rating (1-4: again/hard/good/easy)
  easiness_factor FLOAT (2.5),   -- SM-2 EF
  interval_days INT (1),         -- current interval
  repetition_count INT (0),      -- consecutive correct
  last_studied_at, next_review_at
)
```

**New tables:**

```sql
StudySession (
  id, started_at, completed_at,
  mode TEXT,                     -- 'flashcard', 'quiz', 'revenge', 'deep_dive'
  question_count INT,
  correct_count INT,
  settings_json TEXT             -- timer, filters, etc.
)

SessionAnswer (
  id, session_id FK, question_id FK,
  was_correct BOOL, confidence INT,
  answered_at TIMESTAMP
)

Bookmark (
  id, question_id FK UNIQUE,
  created_at
)

QuestionNote (
  id, question_id FK UNIQUE,
  note_text TEXT,
  created_at, updated_at
)

QuestionTag (
  id, question_id FK, tag TEXT,
  created_at,
  UNIQUE(question_id, tag)
)

DailyActivity (
  date TEXT PK,                  -- 'YYYY-MM-DD'
  questions_studied INT,
  questions_correct INT
)

AIResponse (
  id, question_id FK,
  mode TEXT,                     -- 'quick', 'deep_dive', 'quiz_bowl'
  response_text TEXT,
  created_at,
  UNIQUE(question_id, mode)
)

AppSettings (
  key TEXT PK,
  value TEXT                     -- JSON-encoded setting values
)
```

### 6.4 Frontend (React + Vite)

| Area | Choice |
|------|--------|
| Framework | React 18 |
| Build tool | Vite |
| Routing | React Router v6 |
| State | React Context + useReducer (no Redux — app is simple enough) |
| HTTP | fetch wrapper (no axios needed) |
| Charts | Recharts (lightweight, React-native) |
| Styling | CSS Modules + global design tokens (keeping the playbook's inline-style approach for component-level overrides) |
| Fonts | Google Fonts: Crimson Text (serif) + system Courier New |

### 6.5 Testing & Quality

- **Backend**: pytest for models, API routes, spaced repetition logic
- **Frontend**: Vitest + React Testing Library for component tests
- **Linter**: ruff (backend), ESLint + Prettier (frontend)
- **Pre-commit hooks**: lint + format

---

## 7. Data Preload Strategy

### 7.1 Scrape Plan

1. Use existing `scraper.py` with improved resilience (retry, resume, backoff)
2. Run as a standalone script: `python scripts/scrape_seasons.py --start 60 --end current`
3. Requires `LL_USERNAME` and `LL_PASSWORD` env vars
4. Rate-limited at 1.5s between requests (~37.5s per season × ~100 seasons = ~1 hour total)
5. Output: single `data/questions_seed.json` with all questions

### 7.2 Seed Format

```json
[
  {
    "season": 60,
    "match_day": 1,
    "question_number": 1,
    "question_text": "What is the capital of...",
    "answer": "Ouagadougou",
    "category": "GEOGRAPHY",
    "percent_correct": 42.3
  },
  ...
]
```

### 7.3 DB Seeding
- On first run, Flask checks if `Question` table has rows
- If empty, reads `questions_seed.json` and bulk-inserts via `session.bulk_insert_mappings()`
- Progress reported via startup log (not blocking — app is usable immediately, seeding runs in background thread)

---

## 8. Migration & Phasing

### Phase 1: Foundation & Data
- [ ] Set up new project structure (`backend/` + `frontend/`)
- [ ] Scaffold React app with Vite, React Router, design tokens from playbook
- [ ] Convert Flask to JSON-only API (`/api/v1/`)
- [ ] Add Flask-SQLAlchemy + Alembic migrations
- [ ] Implement new DB schema (all tables)
- [ ] Run season 60+ scrape, generate `questions_seed.json`
- [ ] Build seeder that loads JSON on first run

### Phase 2: Core Study Experience
- [ ] Dashboard page with stats overview + quick actions
- [ ] Flashcard study mode with SM-2 spaced repetition
- [ ] 4-rating scale (Again/Hard/Good/Easy) with next-review display
- [ ] Quiz mode with timer, scoring, session persistence
- [ ] Category and difficulty filtering
- [ ] Bookmark, notes, and tags on questions
- [ ] Keyboard shortcuts (Space, 1-4, S/Arrow, ?)

### Phase 3: Analytics & AI
- [ ] Stats page: category mastery grid, trend charts, calendar heatmap
- [ ] Revenge Match mode (missed-question drills)
- [ ] Category Deep Dive mode
- [ ] Enhanced Learn More with 3 modes + caching
- [ ] Session history with answer review
- [ ] Streak tracking + dashboard display

### Phase 4: Polish & Extras
- [ ] Import page with improved scraper (resume, retry, ETA)
- [ ] Data export (JSON, CSV) and backup
- [ ] Settings page (API keys, study preferences, theme toggle)
- [ ] Manual question entry
- [ ] Toast notifications
- [ ] Shortcut help overlay
- [ ] AI quiz generation (stretch)

---

## 9. Open Questions

1. **Spaced repetition algorithm**: SM-2 (well-understood, Anki-proven) vs. FSRS (newer, potentially better calibration)? Leaning SM-2 for simplicity.
2. **Chart library**: Recharts vs. Chart.js vs. Nivo? Need line charts, bar charts, and a heatmap.
3. **Season range**: Current latest LL season number? Need to confirm 60 is a reasonable starting point (that's ~100 seasons of content).
4. **Quiz answer format**: Free-text input with fuzzy matching, or multiple-choice generated from wrong answers in the same category?
5. **Deployment**: Keep as local `flask run` + `npm run dev`, or build a production bundle where Flask serves the React build?

---

## 10. Success Metrics

- All questions from season 60+ loaded and accessible on first launch
- React frontend renders all 5 pages with playbook design language
- SM-2 intervals produce measurably better recall than the old 1/3/7 system
- Quiz sessions can be completed end-to-end with results persisted
- AI responses are cached — no duplicate Claude API calls
- Category mastery grid shows meaningful data after 1 week of study

---

*This is a living document. Edit freely before implementation begins.*
