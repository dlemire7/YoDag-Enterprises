"""Seed the database with sample trivia questions for testing."""

from datetime import datetime
from models import init_db, Session, Question

SAMPLE_QUESTIONS = [
    {
        "season": "LL88", "match_day": 1, "question_number": 1,
        "category": "SCIENCE",
        "question_text": "What is the chemical symbol for the element tungsten, derived from its German name Wolfram?",
        "answer": "W",
        "percent_correct": 72.3,
    },
    {
        "season": "LL88", "match_day": 1, "question_number": 2,
        "category": "GEOGRAPHY",
        "question_text": "What is the only country in the world that lies entirely above 1,000 meters in elevation?",
        "answer": "LESOTHO",
        "percent_correct": 34.1,
    },
    {
        "season": "LL88", "match_day": 1, "question_number": 3,
        "category": "LITERATURE",
        "question_text": "What Kurt Vonnegut novel features the fictional substance ice-nine, capable of freezing all water on Earth?",
        "answer": "CAT'S CRADLE",
        "percent_correct": 58.7,
    },
    {
        "season": "LL88", "match_day": 1, "question_number": 4,
        "category": "FILM",
        "question_text": "What 1974 Roman Polanski film, starring Jack Nicholson and Faye Dunaway, is set in 1930s Los Angeles during a water rights scandal?",
        "answer": "CHINATOWN",
        "percent_correct": 81.2,
    },
    {
        "season": "LL88", "match_day": 1, "question_number": 5,
        "category": "FOOD/DRINK",
        "question_text": "What Italian dessert, whose name translates to 'pick me up,' is made with ladyfingers, mascarpone, and espresso?",
        "answer": "TIRAMISU",
        "percent_correct": 89.4,
    },
    {
        "season": "LL88", "match_day": 1, "question_number": 6,
        "category": "AMER HIST",
        "question_text": "What 1803 Supreme Court case established the principle of judicial review in the United States?",
        "answer": "MARBURY V. MADISON",
        "percent_correct": 45.6,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 1,
        "category": "GAMES/SPORT",
        "question_text": "In chess, what is the term for a situation where a player is not in check but has no legal moves?",
        "answer": "STALEMATE",
        "percent_correct": 85.0,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 2,
        "category": "MATH",
        "question_text": "What is the name of the sequence where each number is the sum of the two preceding ones: 0, 1, 1, 2, 3, 5, 8, 13...?",
        "answer": "FIBONACCI SEQUENCE",
        "percent_correct": 91.2,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 3,
        "category": "WORLD HIST",
        "question_text": "What treaty, signed in 1648, ended the Thirty Years' War and established the concept of state sovereignty in Europe?",
        "answer": "PEACE OF WESTPHALIA",
        "percent_correct": 28.9,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 4,
        "category": "ART",
        "question_text": "What Dutch painter, known for works such as 'Girl with a Pearl Earring,' worked primarily in Delft during the 17th century?",
        "answer": "JOHANNES VERMEER",
        "percent_correct": 67.3,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 5,
        "category": "LANGUAGE",
        "question_text": "What figure of speech uses exaggeration for emphasis or effect, such as 'I'm so hungry I could eat a horse'?",
        "answer": "HYPERBOLE",
        "percent_correct": 76.8,
    },
    {
        "season": "LL88", "match_day": 2, "question_number": 6,
        "category": "BUS/ECON",
        "question_text": "What economic term describes a market structure in which a single seller dominates, controlling supply and price?",
        "answer": "MONOPOLY",
        "percent_correct": 92.1,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 1,
        "category": "TV/RADIO",
        "question_text": "What HBO series, set in Baltimore, examined the city's drug trade, police, schools, and politics across five seasons?",
        "answer": "THE WIRE",
        "percent_correct": 78.5,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 2,
        "category": "CLASS MUSIC",
        "question_text": "What Austrian composer wrote 'The Magic Flute' and 'Don Giovanni' before dying at age 35 in 1791?",
        "answer": "WOLFGANG AMADEUS MOZART",
        "percent_correct": 88.6,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 3,
        "category": "LIFESTYLE",
        "question_text": "What Japanese organizational method, popularized by Marie Kondo, asks whether possessions 'spark joy'?",
        "answer": "KONMARI METHOD",
        "percent_correct": 52.4,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 4,
        "category": "CURR EVENTS",
        "question_text": "What international accord, adopted in 2015 by 196 parties, set goals to limit global temperature rise to 1.5 degrees Celsius?",
        "answer": "PARIS AGREEMENT",
        "percent_correct": 71.0,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 5,
        "category": "POP CULTURE",
        "question_text": "What video game franchise, created by Shigeru Miyamoto, features a plumber who rescues Princess Peach from Bowser?",
        "answer": "SUPER MARIO",
        "percent_correct": 95.3,
    },
    {
        "season": "LL88", "match_day": 3, "question_number": 6,
        "category": "SCIENCE",
        "question_text": "What subatomic particle, theorized by Peter Higgs and confirmed at CERN in 2012, gives other particles mass?",
        "answer": "HIGGS BOSON",
        "percent_correct": 63.7,
    },
]


def seed():
    init_db()
    db = Session()
    added = 0
    try:
        for q in SAMPLE_QUESTIONS:
            exists = (
                db.query(Question)
                .filter_by(season=q["season"], match_day=q["match_day"], question_number=q["question_number"])
                .first()
            )
            if exists:
                continue
            db.add(Question(**q, created_at=datetime.utcnow()))
            added += 1
        db.commit()
        print(f"Seeded {added} questions ({len(SAMPLE_QUESTIONS) - added} already existed)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
