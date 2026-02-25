#!/usr/bin/env python3
"""Standalone script to scrape LearnedLeague questions and save to JSON.

Saves incrementally after each season so progress is not lost on interruption.
Supports resuming from a partial JSON file.

Usage:
    python scripts/scrape_seasons.py --start 60 --end 107 --username USER --password PASS
"""

import argparse
import json
import os
import sys
import time

# Add backend to path so we can import the scraper
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from scraper import create_session, scrape_match_day


def save_json(questions, output_path):
    """Atomically save questions to JSON file."""
    tmp_path = output_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)
    # Atomic rename (on Windows this may need to remove target first)
    if os.path.exists(output_path):
        os.remove(output_path)
    os.rename(tmp_path, output_path)


def main():
    parser = argparse.ArgumentParser(description='Scrape LearnedLeague questions to JSON')
    parser.add_argument('--start', type=int, required=True, help='Start season number (e.g. 60)')
    parser.add_argument('--end', type=int, required=True, help='End season number (e.g. 107)')
    parser.add_argument('--output', type=str, default='backend/data/questions_seed.json',
                        help='Output JSON file path')
    parser.add_argument('--username', type=str, default=os.environ.get('LL_USERNAME', ''),
                        help='LL username (or set LL_USERNAME env var)')
    parser.add_argument('--password', type=str, default=os.environ.get('LL_PASSWORD', ''),
                        help='LL password (or set LL_PASSWORD env var)')
    args = parser.parse_args()

    if not args.username or not args.password:
        print("Error: username and password are required.")
        print("Pass --username/--password or set LL_USERNAME/LL_PASSWORD env vars.")
        sys.exit(1)

    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Load existing data to resume from
    all_questions = []
    scraped_keys = set()
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            all_questions = json.load(f)
        for q in all_questions:
            scraped_keys.add((q['season'], q['match_day'], q['question_number']))
        print(f"Resuming: loaded {len(all_questions)} existing questions from {output_path}")

    # Figure out which seasons are already fully scraped (all 150 questions present)
    season_question_counts = {}
    for q in all_questions:
        s = q['season']
        if isinstance(s, str):
            s = s.replace('LL', '')
        s = int(s)
        season_question_counts[s] = season_question_counts.get(s, 0) + 1

    total_seasons = args.end - args.start + 1
    total_match_days = total_seasons * 25
    completed_md = 0

    print(f"Scraping seasons {args.start} through {args.end} ({total_seasons} seasons)")
    print(f"Estimated match days: {total_match_days}")
    print(f"Estimated time: ~{total_match_days * 2 / 60:.0f} minutes")
    print()

    # Login once
    print("Logging in to LearnedLeague...")
    session = create_session(args.username, args.password)
    print("Login successful!\n")

    errors = []
    total_new = 0
    start_time = time.time()

    for season in range(args.start, args.end + 1):
        # Skip seasons that are already fully scraped (150 questions = 25 days * 6 questions)
        existing_count = season_question_counts.get(season, 0)
        if existing_count >= 150:
            print(f"Season LL{season}: already scraped ({existing_count} questions), skipping")
            completed_md += 25
            continue

        season_new = 0
        season_errors = 0
        print(f"--- Season LL{season} ---")

        for md in range(1, 26):
            completed_md += 1
            elapsed = time.time() - start_time
            rate = completed_md / elapsed if elapsed > 0 else 0
            remaining = (total_match_days - completed_md) / rate if rate > 0 else 0

            print(f"  MD{md:2d}  [{completed_md}/{total_match_days}]  ", end='', flush=True)

            try:
                questions = scrape_match_day(session, season, md)
                if questions:
                    new_count = 0
                    for q in questions:
                        # Normalize season to int for storage
                        season_val = q['season']
                        if isinstance(season_val, str):
                            season_val = season_val.replace('LL', '')
                        season_int = int(season_val)
                        q['season'] = season_int

                        key = (season_int, q['match_day'], q['question_number'])
                        if key not in scraped_keys:
                            all_questions.append(q)
                            scraped_keys.add(key)
                            new_count += 1

                    print(f"{len(questions)} found, {new_count} new")
                    season_new += new_count
                    total_new += new_count
                else:
                    print("no data")

                time.sleep(1.5)

            except Exception as e:
                error_msg = f"LL{season} MD{md}: {e}"
                print(f"ERROR: {e}")
                errors.append(error_msg)
                season_errors += 1
                time.sleep(3)

        # Save after each season completes
        all_questions.sort(key=lambda q: (
            int(str(q['season']).replace('LL', '')),
            q['match_day'],
            q['question_number']
        ))
        save_json(all_questions, output_path)

        elapsed_min = (time.time() - start_time) / 60
        print(f"  Season LL{season} done: {season_new} new questions, "
              f"{season_errors} errors. Total: {len(all_questions)} questions. "
              f"Saved. [{elapsed_min:.1f}m elapsed]\n")

    elapsed_total = (time.time() - start_time) / 60
    print(f"{'=' * 60}")
    print(f"COMPLETE!")
    print(f"Total questions in file: {len(all_questions)}")
    print(f"New questions this run: {total_new}")
    print(f"Errors: {len(errors)}")
    print(f"Time: {elapsed_total:.1f} minutes")
    print(f"Output: {output_path}")

    if errors:
        print(f"\nErrors encountered:")
        for err in errors:
            print(f"  - {err}")


if __name__ == '__main__':
    main()
