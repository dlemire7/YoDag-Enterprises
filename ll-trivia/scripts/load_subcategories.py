#!/usr/bin/env python3
"""Parse subcategorized PDF and load subcategory data into the trivia DB."""

import os
import re
import sys

import fitz  # PyMuPDF

# Add backend to path so we can import models
BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend')
sys.path.insert(0, BACKEND_DIR)

from app import create_app
from models import Question, db

PDF_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'YoDag-Enterprises', 'll-trivia', 'll_trivia_questions_subcategorized.pdf',
)

# Patterns
CATEGORY_HEADER_RE = re.compile(
    r'^(AMER HIST|ART|BUS/ECON|CLASS MUSIC|CURR EVENTS|FILM|FOOD/DRINK|'
    r'GAMES/SPORT|GEOGRAPHY|LANGUAGE|LIFESTYLE|LITERATURE|MATH|POP MUSIC|'
    r'SCIENCE|TELEVISION|THEATRE|WORLD HIST)$'
)
QUESTIONS_COUNT_RE = re.compile(r'^\d+ questions$')
SEASON_RE = re.compile(r'^Season (\d+)$')
MATCH_DAY_RE = re.compile(r'^Match Day (\d+)$')
QUESTION_RE = re.compile(r'^Q(\d+) \((\d+)%\)')
ANSWER_RE = re.compile(r'^A: (.+)')
PRIMARY_RE = re.compile(r'^Primary:\s*(.+?)(?:\s*\|\s*Secondary:\s*(.+))?$')


def parse_pdf(pdf_path):
    """Parse the subcategorized PDF and yield question records."""
    doc = fitz.open(pdf_path)

    current_category = None
    current_season = None
    current_match_day = None
    current_question_number = None
    current_percent = None
    waiting_for_primary = False

    for page_idx in range(doc.page_count):
        text = doc[page_idx].get_text()
        lines = text.split('\n')

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Category header (followed by "NNN questions")
            m = CATEGORY_HEADER_RE.match(line)
            if m and i + 1 < len(lines) and QUESTIONS_COUNT_RE.match(lines[i + 1].strip()):
                current_category = line
                current_season = None
                current_match_day = None
                i += 2
                continue

            # Season header
            m = SEASON_RE.match(line)
            if m:
                current_season = int(m.group(1))
                current_match_day = None
                i += 1
                continue

            # Match Day header
            m = MATCH_DAY_RE.match(line)
            if m:
                current_match_day = int(m.group(1))
                i += 1
                continue

            # Question line
            m = QUESTION_RE.match(line)
            if m:
                current_question_number = int(m.group(1))
                current_percent = int(m.group(2))
                waiting_for_primary = True
                i += 1
                continue

            # Answer line (skip - we just need to reach the Primary line)
            m = ANSWER_RE.match(line)
            if m:
                i += 1
                continue

            # Primary (and optional Secondary) subcategory
            m = PRIMARY_RE.match(line)
            if m and waiting_for_primary:
                primary = m.group(1).strip()
                secondary = m.group(2).strip() if m.group(2) else None

                yield {
                    'category': current_category,
                    'season': current_season,
                    'match_day': current_match_day,
                    'question_number': current_question_number,
                    'primary': primary,
                    'secondary': secondary,
                }
                waiting_for_primary = False
                i += 1
                continue

            i += 1

    doc.close()


def main():
    if not os.path.exists(PDF_PATH):
        print(f'ERROR: PDF not found at {PDF_PATH}')
        sys.exit(1)

    print(f'Parsing PDF: {PDF_PATH}')
    records = list(parse_pdf(PDF_PATH))
    print(f'Parsed {len(records)} subcategory records from PDF')

    app = create_app()
    with app.app_context():
        matched = 0
        unmatched = 0
        unmatched_records = []

        for rec in records:
            q = Question.query.filter_by(
                season=rec['season'],
                match_day=rec['match_day'],
                question_number=rec['question_number'],
            ).first()

            if q:
                q.subcategory = rec['primary']
                q.subcategory_secondary = rec['secondary']
                matched += 1
            else:
                unmatched += 1
                if unmatched <= 20:
                    unmatched_records.append(rec)

        db.session.commit()

        print(f'\nResults:')
        print(f'  Matched & updated: {matched}')
        print(f'  Unmatched:         {unmatched}')

        if unmatched_records:
            print(f'\nFirst {len(unmatched_records)} unmatched records:')
            for r in unmatched_records:
                print(f'  S{r["season"]} MD{r["match_day"]} Q{r["question_number"]} '
                      f'({r["category"]}) -> {r["primary"]}')

        # Summary stats
        total_with_sub = Question.query.filter(Question.subcategory.isnot(None)).count()
        print(f'\nQuestions with subcategory: {total_with_sub}')

        subcats = (db.session.query(Question.subcategory, db.func.count(Question.id))
                   .filter(Question.subcategory.isnot(None))
                   .group_by(Question.subcategory)
                   .all())
        print(f'Distinct subcategories: {len(subcats)}')


if __name__ == '__main__':
    main()
