"""LearnedLeague question scraper.

Authenticates to LearnedLeague, scrapes match-day pages, and extracts
questions, answers, categories, and percent-correct values.

Can be used as a library (imported by app.py for background scrapes)
or via the standalone script in scripts/scrape_seasons.py.
"""

import re
import time
import logging
from datetime import datetime

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

LOGIN_URL = "https://learnedleague.com/ucp.php"
MATCH_URL = "https://learnedleague.com/match.php"

LL_CATEGORIES = [
    'AMER HIST', 'WORLD HIST', 'SCIENCE', 'LITERATURE', 'ART',
    'GEOGRAPHY', 'ENTERTAINMENT', 'POP MUSIC', 'CLASS MUSIC',
    'FOOD/DRINK', 'GAMES/SPORT', 'BUS/ECON', 'LIFESTYLE',
    'LANGUAGE', 'MATH', 'FILM', 'TV', 'THEATRE',
]


def create_session(username, password):
    """Create an authenticated requests session for LearnedLeague."""
    if not username or not password:
        raise ValueError("LL_USERNAME and LL_PASSWORD are required")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })

    login_page = session.get(LOGIN_URL)
    login_page.raise_for_status()

    soup = BeautifulSoup(login_page.text, "lxml")

    payload = {}
    form = soup.find("form")
    if form:
        for inp in form.find_all("input"):
            name = inp.get("name")
            if not name:
                continue
            if inp.get("type") == "hidden":
                payload[name] = inp.get("value", "")

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
    return candidates[0]


def scrape_match_day(session, season_num, match_day, max_retries=3):
    """Scrape all 6 questions from a match day results page.

    Returns a list of question dicts, or empty list on failure.
    Retries with exponential backoff on transient errors.
    """
    url = f"{MATCH_URL}?{season_num}&{match_day}"

    for attempt in range(max_retries):
        try:
            logger.info(f"Scraping {url} (attempt {attempt + 1})")
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            break
        except (requests.RequestException, requests.Timeout) as e:
            if attempt < max_retries - 1:
                wait = 3 * (2 ** attempt)
                logger.warning(f"Retry {attempt + 1} for {url}: {e}, waiting {wait}s")
                time.sleep(wait)
            else:
                logger.error(f"Failed after {max_retries} attempts: {url}")
                return []

    if "not a valid" in resp.text.lower():
        logger.warning(f"No data for season {season_num} MD {match_day}")
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    h1 = soup.find("h1", class_="matchday")
    if not h1:
        logger.warning(f"No matchday heading for LL{season_num} MD{match_day}")
        return []

    question_divs = soup.select("div.ind-Q20")
    if not question_divs:
        logger.warning(f"No question divs found for LL{season_num} MD{match_day}")
        return []

    answers = {}
    for qnum in range(1, 7):
        ans_div = soup.find("div", id=f"Q{qnum}{match_day}ANS")
        if not ans_div:
            ans_div = soup.find("div", id=re.compile(rf"Q{qnum}\d*ANS"))
        if ans_div:
            answers[qnum] = ans_div.get_text(strip=True)

    percentages = _parse_metrics_table(soup)

    questions = []
    for i, div in enumerate(question_divs):
        qnum = i + 1
        full_text = div.get_text(" ", strip=True)
        full_text = re.sub(r"^Q\d+\s*\.\s*", "", full_text)
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
    """Split 'CATEGORY - question text' into (category, question_text)."""
    m = re.match(r"^([A-Z][A-Z&/ ]+?)\s+-\s+(.+)$", text, re.DOTALL)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    for cat in LL_CATEGORIES:
        pattern = re.compile(re.escape(cat) + r"\s*-\s+(.+)", re.DOTALL | re.IGNORECASE)
        m = pattern.match(text)
        if m:
            return cat, m.group(1).strip()

    return None, text


def _parse_metrics_table(soup):
    """Extract leaguewide correct % per question from the metrics table."""
    percentages = {}

    table = soup.select_one("table.std")
    if not table:
        return percentages

    tfoot = table.find("tfoot")
    target_row = None

    if tfoot:
        rows = tfoot.find_all("tr")
        for row in rows:
            text = row.get_text(strip=True).lower()
            if "leaguewide" in text or "league" in text:
                target_row = row
                break
        if not target_row and rows:
            target_row = rows[0]

    if not target_row:
        all_rows = table.find_all("tr")
        for row in reversed(all_rows):
            text = row.get_text(strip=True).lower()
            if "leaguewide" in text or "league" in text:
                target_row = row
                break

    if not target_row:
        return percentages

    cells = target_row.find_all("td")
    for i in range(1, 7):
        col_index = i + 1
        if col_index < len(cells):
            cell_text = cells[col_index].get_text(strip=True)
            m = re.search(r"(\d{1,3})%?", cell_text)
            if m:
                percentages[i] = float(m.group(1))

    return percentages


def scrape_season_range(start_season, end_season, username, password,
                        progress_callback=None, save_callback=None):
    """Scrape questions for a range of seasons.

    Args:
        start_season: Starting season number (e.g. 60)
        end_season: Ending season number (e.g. 102)
        username: LL username
        password: LL password
        progress_callback: Optional callable(message) for status updates
        save_callback: Optional callable(questions_list) to persist questions.
                       If None, returns all questions in the result dict.

    Returns:
        dict with total_saved, total_skipped, errors, and optionally questions
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
    all_questions = []

    total_match_days = (end_season - start_season + 1) * 25
    completed = 0

    for season in range(start_season, end_season + 1):
        report(f"Starting season LL{season}")
        for md in range(1, 26):
            try:
                report(f"Scraping LL{season} Match Day {md}... ({completed}/{total_match_days})")
                questions = scrape_match_day(ll_session, season, md)
                if questions:
                    if save_callback:
                        saved, skipped = save_callback(questions)
                        total_saved += saved
                        total_skipped += skipped
                        report(f"  LL{season} MD{md}: {saved} saved, {skipped} skipped")
                    else:
                        all_questions.extend(questions)
                        total_saved += len(questions)
                        report(f"  LL{season} MD{md}: {len(questions)} questions")
                else:
                    report(f"  LL{season} MD{md}: no questions found")

                time.sleep(1.5)
            except Exception as e:
                error_msg = f"Error scraping LL{season} MD{md}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                report(error_msg)
                time.sleep(3)

            completed += 1

    report(
        f"Done. Saved {total_saved}, skipped {total_skipped}, "
        f"errors: {len(errors)}"
    )
    result = {
        "total_saved": total_saved,
        "total_skipped": total_skipped,
        "errors": errors,
    }
    if not save_callback:
        result["questions"] = all_questions
    return result
