import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(BASE_DIR, "trivia.db")
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key-change-in-prod")

LL_USERNAME = os.environ.get("LL_USERNAME", "")
LL_PASSWORD = os.environ.get("LL_PASSWORD", "")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

LL_CATEGORIES = [
    "AMER HIST", "ART", "BUS/ECON", "CLASS MUSIC", "CURR EVENTS",
    "FILM", "FOOD/DRINK", "GAMES/SPORT", "GEOGRAPHY", "LANGUAGE",
    "LIFESTYLE", "LITERATURE", "MATH", "POP MUSIC", "SCIENCE",
    "TELEVISION", "THEATRE", "WORLD HIST",
]
