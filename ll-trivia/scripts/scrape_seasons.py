#!/usr/bin/env python3
"""Standalone script to scrape LearnedLeague questions and save to JSON.

Usage:
    python scripts/scrape_seasons.py --start 60 --end 102 --output backend/data/questions_seed.json

Requires LL_USERNAME and LL_PASSWORD environment variables, or pass --username/--password.
"""

import argparse
import json
import os
import sys

# Add backend to path so we can import the scraper
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from scraper import scrape_season_range


def main():
    parser = argparse.ArgumentParser(description='Scrape LearnedLeague questions to JSON')
    parser.add_argument('--start', type=int, required=True, help='Start season number (e.g. 60)')
    parser.add_argument('--end', type=int, required=True, help='End season number (e.g. 102)')
    parser.add_argument('--output', type=str, default='backend/data/questions_seed.json',
                        help='Output JSON file path')
    parser.add_argument('--username', type=str, default=os.environ.get('LL_USERNAME', ''),
                        help='LL username (or set LL_USERNAME env var)')
    parser.add_argument('--password', type=str, default=os.environ.get('LL_PASSWORD', ''),
                        help='LL password (or set LL_PASSWORD env var)')
    parser.add_argument('--resume', type=str, default=None,
                        help='Resume from a partial JSON file (skips already-scraped season/match_day combos)')
    args = parser.parse_args()

    if not args.username or not args.password:
        print("Error: LL_USERNAME and LL_PASSWORD are required.")
        print("Set them as environment variables or pass --username/--password.")
        sys.exit(1)

    # Load existing data if resuming
    existing = []
    existing_keys = set()
    if args.resume and os.path.exists(args.resume):
        print(f"Resuming from {args.resume}...")
        with open(args.resume, 'r', encoding='utf-8') as f:
            existing = json.load(f)
        for q in existing:
            existing_keys.add((q['season'], q['match_day'], q['question_number']))
        print(f"Loaded {len(existing)} existing questions")

    print(f"Scraping seasons {args.start} through {args.end}...")
    print(f"Estimated time: ~{(args.end - args.start + 1) * 37.5 / 60:.0f} minutes")
    print()

    def on_progress(msg):
        print(msg)

    result = scrape_season_range(
        start_season=args.start,
        end_season=args.end,
        username=args.username,
        password=args.password,
        progress_callback=on_progress,
    )

    questions = result.get('questions', [])

    # If resuming, merge and deduplicate
    if existing:
        for q in questions:
            key = (q['season'], q['match_day'], q['question_number'])
            if key not in existing_keys:
                existing.append(q)
                existing_keys.add(key)
        questions = existing

    # Sort by season, match_day, question_number for consistency
    questions.sort(key=lambda q: (q['season'], q['match_day'], q['question_number']))

    # Ensure output directory exists
    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(questions)} questions to {output_path}")
    print(f"Saved: {result['total_saved']}, Skipped: {result['total_skipped']}, Errors: {len(result['errors'])}")

    if result['errors']:
        print("\nErrors encountered:")
        for err in result['errors']:
            print(f"  - {err}")


if __name__ == '__main__':
    main()
