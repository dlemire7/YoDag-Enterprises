# LL Trivia

A Flask web app for studying [LearnedLeague](https://www.learnedleague.com/) trivia questions with spaced repetition.

## Features

- **Spaced repetition** — cards resurface based on your confidence ratings (1 day, 3 days, or 7 days)
- **Study modes** — Review due cards, study unseen questions, browse all, or Climb the Mountain (easiest to hardest within a category)
- **Difficulty filtering** — Filter by easy (>=70%), medium (30-70%), or hard (<30%) based on LearnedLeague percent-correct stats
- **Category filtering** — Study by any of the 18 LearnedLeague categories
- **Learn More** — AI-powered explanations via Claude for deeper understanding
- **Season import** — Scrape full seasons directly from LearnedLeague (requires credentials)
- **Stats dashboard** — Track your study progress over time

## Getting Started

```bash
cd ll-trivia
pip install -r requirements.txt
python app.py
```

The app runs at http://127.0.0.1:5000. On first run, ~900 bundled questions are automatically loaded.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | For "Learn More" | Powers AI explanations via Claude |
| `LL_USERNAME` | For importing | LearnedLeague login username |
| `LL_PASSWORD` | For importing | LearnedLeague login password |
| `FLASK_SECRET_KEY` | No | Session secret key (defaults to dev key) |

## Tech Stack

- **Backend** — Python / Flask / SQLAlchemy / SQLite
- **Frontend** — Vanilla JS with Jinja2 templates
- **Styling** — Dark theme CSS
- **AI** — Anthropic Claude API for question explanations
- **Scraping** — BeautifulSoup for LearnedLeague season imports
