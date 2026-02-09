"""Find available season range on LL."""

import os
import logging
logging.basicConfig(level=logging.WARNING)

from scraper import create_session

username = os.environ.get("LL_USERNAME", "")
password = os.environ.get("LL_PASSWORD", "")
session = create_session(username, password)

# Test a range of seasons to find which ones have data
import requests
for s in [60, 70, 80, 85, 88, 90, 95, 98, 99, 100, 101, 102, 103, 104, 105]:
    resp = session.get(f"https://learnedleague.com/match.php?{s}&1")
    has_data = "not a valid" not in resp.text.lower() and "matchday" in resp.text.lower()
    print(f"Season {s}: {'YES' if has_data else 'no'}")
