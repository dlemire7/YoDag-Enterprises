import re
import time
import logging
from datetime import datetime

import requests
from bs4 import BeautifulSoup

import config
from models import Session, Question

logger = logging.getLogger(__name__)

LOGIN_URL = "https://learnedleague.com/ucp.php"
MATCH_URL = "https://learnedleague.com/match.php"


def create_session(username=None, password=None):
    """Create an authenticated requests session for LearnedLeague."""
    username = username or config.LL_USERNAME
    password = password or config.LL_PASSWORD

    if not username or not password:
        raise ValueError(
            "LL_USERNAME and LL_PASSWORD must be set as environment variables"
        )

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })

    # Fetch the login page first to get any CSRF tokens / cookies
    login_page = session.get(LOGIN_URL)
    login_page.raise_for_status()

    soup = BeautifulSoup(login_page.text, "lxml")

    # Build login payload - look for form fields dynamically
    payload = {}
    form = soup.find("form")
    if form:
        for inp in form.find_all("input"):
            name = inp.get("name")
            if not name:
                continue
            if inp.get("type") == "hidden":
                payload[name] = inp.get("value", "")

    # Add credentials - try common field name patterns
    username_field = _find_field_name(soup, ["username", "login", "user", "email"])
    password_field = _find_field_name(soup, ["password", "pass", "pwd"])

    payload[username_field] = username
    payload[password_field] = password

    action = LOGIN_URL
    if form and form.get("action"):
        action_attr = form["action"]
        if action_attr.startswith("http"):
            action = action_attr
        else:
            action = "https://learnedleague.com/" + action_attr.lstrip("/")

    resp = session.post(action, data=payload, allow_redirects=True)
    resp.raise_for_status()

    # Verify login succeeded by checking for common indicators
    if "invalid" in resp.text.lower() and "password" in resp.text.lower():
        raise ValueError("Login failed - check credentials")

    logger.info("Login successful")
    return session


def _find_field_name(soup, candidates):
    """Find a form input name matching one of the candidate patterns."""
    for inp in soup.find_all("input"):
        name = (inp.get("name") or "").lower()
        for candidate in candidates:
            if candidate in name:
                return inp.get("name")
    # Fallback to first candidate
    return candidates[0]


def scrape_match_day(session, season_num, match_day):
    """Scrape all 6 questions from a match day results page.

    Uses match.php?{season}&{matchday} which contains all questions,
    answers, categories, and the metrics table with correct percentages.

    Returns a list of question dicts, or empty list on failure.
    """
    url = f"{MATCH_URL}?{season_num}&{match_day}"
    logger.info(f"Scraping {url}")

    resp = session.get(url)
    resp.raise_for_status()

    if "not a valid" in resp.text.lower():
        logger.warning(f"No data for season {season_num} MD {match_day}")
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    # Check we got an actual match day page (has the matchday heading)
    h1 = soup.find("h1", class_="matchday")
    if not h1:
        logger.warning(f"No matchday heading for LL{season_num} MD{match_day}")
        return []

    # ── Parse questions from div.ind-Q20 blocks ─────────────────────────
    question_divs = soup.select("div.ind-Q20")
    if not question_divs:
        logger.warning(f"No question divs found for LL{season_num} MD{match_day}")
        return []

    # ── Parse answers from hidden divs (id pattern: Q{n}{md}ANS) ────────
    answers = {}
    for qnum in range(1, 7):
        # Answer divs use IDs like Q11ANS, Q21ANS, etc.
        ans_div = soup.find("div", id=f"Q{qnum}{match_day}ANS")
        if not ans_div:
            # Try alternate ID patterns
            ans_div = soup.find("div", id=re.compile(rf"Q{qnum}\d*ANS"))
        if ans_div:
            answers[qnum] = ans_div.get_text(strip=True)

    # ── Parse percent correct from the metrics table ────────────────────
    percentages = _parse_metrics_table(soup)

    # ── Build question list ─────────────────────────────────────────────
    questions = []
    for i, div in enumerate(question_divs):
        qnum = i + 1
        full_text = div.get_text(" ", strip=True)

        # Remove the "Q1 ." or "Q1." prefix left from the link text
        full_text = re.sub(r"^Q\d+\s*\.\s*", "", full_text)

        # Split "CATEGORY - question text"
        category, question_text = _split_category_question(full_text)

        questions.append({
            "season": f"LL{season_num}",
            "match_day": match_day,
            "question_number": qnum,
            "category": category or "UNKNOWN",
            "question_text": question_text,
            "answer": answers.get(qnum, "Unknown"),
            "percent_correct": percentages.get(qnum),
        })

    return questions


def _split_category_question(text):
    """Split 'CATEGORY - question text' into (category, question_text).

    Categories are uppercase, may contain slashes and spaces
    (e.g., GAMES/SPORT, POP MUSIC, BUS/ECON, AMER HIST).
    """
    # Match category prefix: uppercase words (with / and spaces) followed by " - "
    m = re.match(r"^([A-Z][A-Z&/ ]+?)\s+-\s+(.+)$", text, re.DOTALL)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    # Fallback: check for known categories
    for cat in config.LL_CATEGORIES:
        pattern = re.compile(re.escape(cat) + r"\s*-\s+(.+)", re.DOTALL | re.IGNORECASE)
        m = pattern.match(text)
        if m:
            return cat, m.group(1).strip()

    return None, text


def _parse_metrics_table(soup):
    """Extract leaguewide correct % per question from the metrics table.

    The metrics table (table.std) has a tfoot with the leaguewide row.
    Columns: Rundle, Forf%, Q1, Q2, Q3, Q4, Q5, Q6, All
    Returns dict {question_number: percent_correct}.
    """
    percentages = {}

    table = soup.select_one("table.std")
    if not table:
        return percentages

    # Look for the leaguewide row in tfoot or last rows
    tfoot = table.find("tfoot")
    target_row = None

    if tfoot:
        rows = tfoot.find_all("tr")
        for row in rows:
            text = row.get_text(strip=True).lower()
            if "leaguewide" in text or "league" in text:
                target_row = row
                break
        # If no explicit leaguewide label, use first tfoot row
        if not target_row and rows:
            target_row = rows[0]

    if not target_row:
        # Try last row in tbody
        all_rows = table.find_all("tr")
        for row in reversed(all_rows):
            text = row.get_text(strip=True).lower()
            if "leaguewide" in text or "league" in text:
                target_row = row
                break

    if not target_row:
        return percentages

    cells = target_row.find_all("td")
    # Expected columns: Rundle(0), Forf%(1), Q1(2), Q2(3), Q3(4), Q4(5), Q5(6), Q6(7), All(8)
    for i in range(1, 7):
        col_index = i + 1  # Q1 is at index 2, Q2 at 3, etc.
        if col_index < len(cells):
            cell_text = cells[col_index].get_text(strip=True)
            m = re.search(r"(\d{1,3})%?", cell_text)
            if m:
                percentages[i] = float(m.group(1))

    return percentages


def save_questions(questions):
    """Save scraped questions to the database, skipping duplicates."""
    db = Session()
    saved = 0
    skipped = 0
    try:
        for q in questions:
            existing = (
                db.query(Question)
                .filter_by(
                    season=q["season"],
                    match_day=q["match_day"],
                    question_number=q["question_number"],
                )
                .first()
            )
            if existing:
                skipped += 1
                continue

            question = Question(
                season=q["season"],
                match_day=q["match_day"],
                question_number=q["question_number"],
                category=q["category"],
                question_text=q["question_text"],
                answer=q["answer"],
                percent_correct=q["percent_correct"],
                created_at=datetime.utcnow(),
            )
            db.add(question)
            saved += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return saved, skipped


def scrape_season_range(start_season, end_season, username=None, password=None,
                        progress_callback=None):
    """Scrape questions for a range of seasons.

    Args:
        start_season: Starting season number (e.g. 86)
        end_season: Ending season number (e.g. 88)
        username: LL username (or from env)
        password: LL password (or from env)
        progress_callback: Optional callable(message) for status updates

    Returns:
        dict with total_saved, total_skipped, errors
    """
    def report(msg):
        logger.info(msg)
        if progress_callback:
            progress_callback(msg)

    ll_session = create_session(username, password)
    report("Logged in to LearnedLeague")

    total_saved = 0
    total_skipped = 0
    errors = []

    for season in range(start_season, end_season + 1):
        report(f"Starting season LL{season}")
        for md in range(1, 26):
            try:
                report(f"Scraping LL{season} Match Day {md}...")
                questions = scrape_match_day(ll_session, season, md)
                if questions:
                    saved, skipped = save_questions(questions)
                    total_saved += saved
                    total_skipped += skipped
                    report(
                        f"  LL{season} MD{md}: {saved} saved, {skipped} skipped"
                    )
                else:
                    report(f"  LL{season} MD{md}: no questions found")

                # Rate limiting: pause between requests
                time.sleep(1.5)
            except Exception as e:
                error_msg = f"Error scraping LL{season} MD{md}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                report(error_msg)
                time.sleep(3)

    report(
        f"Done. Saved {total_saved}, skipped {total_skipped}, "
        f"errors: {len(errors)}"
    )
    return {
        "total_saved": total_saved,
        "total_skipped": total_skipped,
        "errors": errors,
    }
