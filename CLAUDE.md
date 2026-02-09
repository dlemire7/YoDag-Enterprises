# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Flask web app for studying LearnedLeague trivia questions with spaced repetition. All app code lives in `ll-trivia/`.

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
- Study modes: "review" (due first, then unseen, then rest), "unseen" (never studied), "all"
