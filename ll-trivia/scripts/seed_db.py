#!/usr/bin/env python3
"""Seed the SQLite database from questions_seed.json.

Can be run standalone or imported by app.py for first-run seeding.

Usage:
    python scripts/seed_db.py [--json path/to/questions.json]
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


def seed_from_json(json_path, db_session_factory, Question):
    """Load questions from JSON into the database.

    Args:
        json_path: Path to questions_seed.json
        db_session_factory: Callable that returns a DB session
        Question: The Question model class

    Returns:
        (loaded, skipped) counts
    """
    if not os.path.exists(json_path):
        return 0, 0

    with open(json_path, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    if not questions:
        return 0, 0

    loaded = 0
    skipped = 0
    batch_size = 500

    for i in range(0, len(questions), batch_size):
        batch = questions[i:i + batch_size]
        for q in batch:
            try:
                existing = db_session_factory.query(Question).filter_by(
                    season=q['season'],
                    match_day=q['match_day'],
                    question_number=q['question_number'],
                ).first()
                if existing:
                    skipped += 1
                    continue

                db_session_factory.add(Question(
                    season=q['season'],
                    match_day=q['match_day'],
                    question_number=q['question_number'],
                    question_text=q['question_text'],
                    answer=q['answer'],
                    category=q.get('category', 'UNKNOWN'),
                    percent_correct=q.get('percent_correct'),
                ))
                loaded += 1
            except Exception:
                skipped += 1

        db_session_factory.commit()

    return loaded, skipped


def seed_from_json_bulk(json_path, db, Question):
    """Bulk-load questions from JSON. Faster than row-by-row for large datasets.

    Args:
        json_path: Path to questions_seed.json
        db: Flask-SQLAlchemy db instance (with active app context)
        Question: The Question model class

    Returns:
        (loaded, skipped) counts
    """
    if not os.path.exists(json_path):
        return 0, 0

    with open(json_path, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    if not questions:
        return 0, 0

    # Get existing keys to skip duplicates
    existing_keys = set()
    rows = db.session.execute(
        db.select(Question.season, Question.match_day, Question.question_number)
    ).all()
    for row in rows:
        existing_keys.add((row[0], row[1], row[2]))

    to_insert = []
    skipped = 0
    for q in questions:
        key = (q['season'], q['match_day'], q['question_number'])
        if key in existing_keys:
            skipped += 1
            continue
        to_insert.append({
            'season': q['season'],
            'match_day': q['match_day'],
            'question_number': q['question_number'],
            'question_text': q['question_text'],
            'answer': q['answer'],
            'category': q.get('category', 'UNKNOWN'),
            'percent_correct': q.get('percent_correct'),
        })
        existing_keys.add(key)

    if to_insert:
        batch_size = 1000
        for i in range(0, len(to_insert), batch_size):
            batch = to_insert[i:i + batch_size]
            db.session.bulk_insert_mappings(Question, batch)
        db.session.commit()

    return len(to_insert), skipped


def main():
    parser = argparse.ArgumentParser(description='Seed the trivia database from JSON')
    parser.add_argument('--json', type=str, default='backend/data/questions_seed.json',
                        help='Path to questions JSON file')
    args = parser.parse_args()

    json_path = os.path.abspath(args.json)
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        print("Run scrape_seasons.py first to generate the seed data.")
        sys.exit(1)

    # Import Flask app to get DB context
    from app import create_app
    from models import db, Question

    app = create_app()
    with app.app_context():
        db.create_all()

        start = time.time()
        loaded, skipped = seed_from_json_bulk(json_path, db, Question)
        elapsed = time.time() - start

        print(f"Seeded {loaded} questions, skipped {skipped} duplicates ({elapsed:.1f}s)")


if __name__ == '__main__':
    main()
