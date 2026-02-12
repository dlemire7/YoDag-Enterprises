# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This repo contains two projects:
- **ll-trivia/** — Flask trivia study app (LearnedLeague)
- **reservation/** — Electron desktop app for NYC restaurant reservation monitoring & auto-booking

---

## Reservation App (reservation/)

### Overview

An Electron + React desktop app that monitors NYC restaurant reservation platforms (Resy, Tock, OpenTable) and auto-books when slots matching user criteria open up. Built with electron-vite, better-sqlite3, and Playwright for browser-based auth.

### Running

```bash
cd reservation
npm install
npm run dev
```

### Architecture

- **Main process**: `src/main/` — Electron main, SQLite database, credentials (encrypted via safeStorage), platform modules, scheduler
- **Preload**: `src/preload/index.js` — IPC bridge with channel allowlists
- **Renderer**: `src/renderer/` — React SPA with pages (Catalog, Monitor, Settings), components, hooks

### Database (`src/main/database.js`)

SQLite via better-sqlite3 with WAL mode. Tables:
- **restaurants** — 40 NYC restaurants with name, neighborhood, borough, cuisine, stars, platform, url, image_url, venue_id
- **watch_jobs** — Monitoring jobs with restaurant_id, target_date, time_slots (JSON), party_size, status, poll_interval_sec, booked_at, confirmation_code
- **booking_history** — Booking attempts/successes with watch_job_id, restaurant, date, time, platform, status, confirmation_code, error_details
- **credentials** — Encrypted platform session data (Resy/Tock/OpenTable)

Schema migrations run in `migrateSchema()` via ALTER TABLE checks.

### Credential Flow (Phase 4 — Complete)

1. User clicks "Sign In" on Settings page → opens real Chrome via Playwright
2. User logs into platform manually → `auth-detect.js` detects login completion
3. Session (cookies + localStorage) encrypted via `safeStorage` and stored in credentials table
4. `getCredential(platform)` decrypts and returns session object

### Monitoring & Booking Engine (Phase 5 — Complete)

**Scheduler** (`src/main/scheduler.js`):
- Starts on app ready, ticks every 10 seconds
- Queries DB for active watch jobs (status = pending/monitoring)
- Respects per-job `poll_interval_sec` via in-memory `lastPollTime` map
- Max 10 concurrent API calls
- Two monitoring strategies: `continuous` (30s default) and `release_time` (aggressive 4s polling in 60s window before calculated release time, falls back to 30s after 10 minutes)
- `parseReleaseSchedule(releaseStr, targetDate)` — parses "N days ahead" / "N weeks ahead" into release Date
- `getEffectiveInterval(job)` — returns Infinity (skip), 4s (sniping), or 30s based on strategy and current time
- Exponential backoff on transient errors via in-memory `retryCount` Map (base * 2^n for server errors, base * 3^n for rate limits, capped at 5 minutes)
- CAPTCHA detection: pauses job, sends desktop notification + IPC event `monitor:captcha-required`
- Booking conflict recovery: detects "slot taken" errors, logs as `conflict` status, resets poll timer for immediate retry
- `resumeJob(jobId)` — resumes a paused job (resets status to monitoring, clears backoff)
- Sends `monitor:job-update` IPC event to renderer on state changes

**Notifications** (`src/main/notifications.js`):
- `notifyBookingSuccess(restaurantName, date, time, confirmationCode)` — Windows toast + sound
- `notifyBookingFailed(restaurantName, errorMsg)` — silent toast
- `notifyCaptchaRequired(restaurantName)` — urgent toast + sound
- Click on any notification focuses the main window

**System Tray** (`src/main/tray.js`):
- Gold diamond icon in system tray
- Context menu: Open, active job count, Quit
- Window close minimizes to tray (monitoring continues in background)
- Double-click tray icon restores window
- `app.isQuitting` flag controls whether close = hide or quit

**Resy API Client** (`src/main/platforms/resy-api.js`):
- Pure HTTP client (no Playwright), uses Node fetch()
- Required headers: `Authorization: ResyAPI api_key="VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"` + `X-Resy-Auth-Token: <token>`
- `extractAuthToken(session)` — parses auth token from Playwright session localStorage
- `resolveVenueId(authToken, url)` — resolves URL slug to venue_id (cached in DB)
- `findAvailability(authToken, venueId, date, partySize)` — GET /4/find
- `getBookingDetails(authToken, configId, day, partySize)` — POST /3/details → book_token
- `getPaymentMethod(authToken)` — GET /2/user → payment_method_id
- `bookReservation(authToken, bookToken, paymentMethodId)` — POST /3/book

**Job Status Flow**: `pending` → `monitoring` → `booked` (success) or `failed` (error/expired) or `paused` (CAPTCHA)

**Error Handling**:
- 401/403: Session expired → job failed, desktop notification, user must re-sign in
- 403/429 + CAPTCHA: Job paused, desktop notification, user must resolve manually then resume
- 429: Rate limited → exponential backoff (3x multiplier, capped at 5 min)
- 5xx: Server error → exponential backoff (2x multiplier, capped at 5 min)
- Expired target_date → job auto-failed
- Booking conflict (slot taken) → logged as `conflict`, immediate retry

**Platform module** (`src/main/platforms/resy.js`):
- `browserLogin()` — Playwright-based browser login flow
- `checkAvailability(session, venueId, date, partySize)` — browser-based via Playwright `context.request` (bypasses Incapsula + DataDog RUM), falls back to resy-api.js direct fetch
- `bookSlot(session, configId, day, partySize)` — chains details → payment → book
- `extractResyToken(session)` — extracts auth token from session localStorage

### Instant Availability & Book Now (Phase 7 — In Progress)

Two new IPC handlers enable checking current availability and booking immediately without creating a watch job:

**`resy:check-availability`** (params: `restaurant_id, date, party_size`):
- Looks up restaurant, validates Resy platform, gets credentials + auth token
- Resolves venue_id (cached in DB via `updateRestaurantVenueId`)
- Calls `resyPlatform.checkAvailability()` → returns `{ success, slots }` or typed error flags (`noCredentials`, `sessionExpired`, `rateLimited`)

**`resy:book-now`** (params: `restaurant_id, config_id, date, party_size, time`):
- Chains `getBookingDetails()` → `getPaymentMethod()` → `bookReservation()`
- On success: creates booking record (watch_job_id=null), sends desktop notification
- On failure: records failed attempt, detects conflicts via regex `/(taken|unavailable|no longer|already.*booked|slot.*gone)/i`
- Returns `{ success, confirmation_code }` or `{ success: false, error, conflict }`

**Wizard integration** (`WatchJobWizard.jsx`):
- Auto-checks availability when reaching Review step (step 5) for Resy restaurants
- Shows loading spinner, error with retry, empty state, or scrollable slot list with Book Now buttons
- Booking success shows green confirmation banner, auto-closes after 2.5s; footer switches to "Done" button
- Booking conflict shows "Refresh Slots" button

**Quick-create integration** (`MonitorPage.jsx`):
- "Check Now" button appears next to "Quick Watch" for Resy restaurants
- Inline availability results below form with Book Now per slot
- Resets availability state when form inputs change

**Known issue**: Resy's `/4/find` endpoint returns 500 via direct Node.js fetch (Incapsula WAF blocking). Browser-based `page.evaluate(fetch(...))` also fails due to DataDog RUM monkey-patching `fetch()`. Current fix uses Playwright `context.request` API which makes HTTP requests with browser cookies but bypasses page JS. Still testing whether this fully resolves the Incapsula issue.

### IPC Channels

Invoke (renderer → main): `db:get-restaurants`, `db:get-watch-jobs`, `db:get-booking-history`, `db:create-watch-job`, `db:update-watch-job`, `db:delete-watch-job`, `db:fetch-restaurant-images`, `app:get-version`, `credentials:get-all-statuses`, `credentials:delete`, `credentials:browser-login`, `monitor:get-status`, `monitor:resume-job`, `resy:check-availability`, `resy:book-now`

Receive (main → renderer): `images:progress`, `images:complete`, `monitor:job-update`, `monitor:captcha-required`

### Key Files

| File | Purpose |
|------|---------|
| `src/main/index.js` | Electron main process, IPC handlers, scheduler/tray lifecycle |
| `src/main/database.js` | SQLite schema, migrations, all query functions |
| `src/main/credentials.js` | Encrypted credential storage via safeStorage |
| `src/main/scheduler.js` | Background polling engine with release-time sniping, exponential backoff, CAPTCHA detection |
| `src/main/notifications.js` | Desktop toast notifications + sound alerts |
| `src/main/tray.js` | System tray icon, context menu, minimize-to-tray |
| `src/main/platforms/resy-api.js` | Resy REST API client (pure HTTP) |
| `src/main/platforms/resy.js` | Resy platform module (Playwright + API) |
| `src/main/platforms/tock.js` | Tock platform module (login only) |
| `src/main/platforms/opentable.js` | OpenTable platform module (login only) |
| `src/main/seed-data.js` | Seeds 40 NYC restaurants into DB |
| `src/main/image-fetcher.js` | Fetches restaurant images |
| `src/renderer/pages/MonitorPage.jsx` | Monitor & Book UI with real-time updates |
| `src/renderer/pages/CatalogPage.jsx` | Restaurant catalog browser |
| `src/renderer/pages/SettingsPage.jsx` | Credential management UI |

### Completed Phases

1. **Phase 1**: Project scaffolding, Electron + React + electron-vite setup
2. **Phase 2**: Restaurant catalog with 40 NYC restaurants, images, search/filter
3. **Phase 3**: Watch job creation (quick-create + wizard), booking history UI
4. **Phase 4**: Credential management — Playwright browser login, encrypted storage
5. **Phase 5**: Resy monitoring engine — scheduler, REST API client, auto-booking, release-time sniping, exponential backoff, CAPTCHA detection, booking conflict recovery, desktop notifications, system tray, real-time UI updates
6. **Phase 6**: UI polish — card hover animations, page transitions, keyboard shortcuts (Ctrl+N, Ctrl+F, Escape), React error boundaries
7. **Phase 7** *(in progress)*: Instant availability check & Book Now — check current Resy availability from wizard Review step and quick-create form, book immediately without creating a watch job. Incapsula/DataDog WAF bypass still being tested.

### Next Steps (Phase 8+)

- Resolve Resy Incapsula/WAF blocking for `/4/find` availability checks
- Tock and OpenTable API clients + booking flows
- Settings UI for poll intervals, max retries, booking preferences
- Electron Forge packaging → Windows .exe installer

---

## LearnedLeague Trivia App (ll-trivia/)

### Overview

A Flask web app for studying LearnedLeague trivia questions with spaced repetition.

## Running the App

```bash
cd ll-trivia
pip install -r requirements.txt
python app.py
```

Runs on http://127.0.0.1:5000. No build step needed — vanilla JS frontend served directly by Flask.

## Environment Variables

- `ANTHROPIC_API_KEY` — Required for the "Learn More" Claude API feature
- `LL_USERNAME` / `LL_PASSWORD` — Optional, for scraping seasons from LearnedLeague
- `FLASK_SECRET_KEY` — Optional, defaults to dev key

## Architecture

### Configuration

`config.py` defines `BASE_DIR`, `SQLALCHEMY_DATABASE_URI` (SQLite at `ll-trivia/trivia.db`), and `LL_CATEGORIES` (the 18 valid LearnedLeague category strings used for parsing).

### Routes

Four pages: dashboard (`/`), study (`/study`), import (`/import`), stats (`/stats`). JSON APIs: `/api/questions`, `/api/progress` (POST), `/api/learn-more` (POST), `/import/scrape` (POST), `/import/status`.

### Request Flow

`app.py` defines all Flask routes. Every request runs `init_db()` via `@app.before_request` to ensure tables exist. On first run with an empty DB, `models.py:_preload_questions()` auto-loads ~900 bundled questions from `questions_data.json`.

### Database Layer

SQLAlchemy with raw `Session()` (not Flask-SQLAlchemy). Every route manually creates a session with `db = Session()` and closes it in a `try/finally` block. There is no migration system — tables are created via `Base.metadata.create_all()`. Delete `trivia.db` to reset.

Two models in `models.py`:
- **Question** — unique on `(season, match_day, question_number)`. Has `to_dict()` for JSON serialization.
- **StudyProgress** — one-to-one with Question via `question_id`. Spaced repetition: confidence 1→1 day, 2→3 days, 3→7 days via `record_attempt()`.

### Frontend

Single-page study UI in `static/app.js` communicates with Flask via JSON APIs (`/api/questions`, `/api/progress`, `/api/learn-more`). Templates in `templates/` use Jinja2 with `base.html` as the layout. All styles in `static/style.css` (dark theme).

### Background Scraping

The import feature runs scraping in a background `threading.Thread`. Progress is tracked in a module-level `scrape_status` dict protected by `scrape_lock`, polled by the frontend via `/import/status`.

### Scraper

`scraper.py` authenticates to LearnedLeague, parses match pages with BeautifulSoup, and extracts questions, answers, categories, and percent-correct from HTML. Each season has 25 match days with 6 questions each. Rate-limited to 1.5s between requests.

## Key Patterns

- No tests exist in this project
- No linter or formatter configured
- The `seed.py` file is a standalone seeder (18 sample questions); `questions_data.json` is the primary data source
- The Claude API call in `/api/learn-more` uses `claude-sonnet-4-5-20250929` with a quizbowl-focused prompt
- Difficulty filtering uses `percent_correct` thresholds: easy ≥70%, medium 30–70%, hard <30%
- Study modes: "review" (due first, then unseen, then rest), "unseen" (never studied), "all", "mountain" (easiest→hardest by percent_correct, 100 questions, requires category)
