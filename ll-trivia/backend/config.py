import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'trivia.db')
SQLALCHEMY_DATABASE_URI = f'sqlite:///{DATABASE_PATH}'
SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-key-change-in-prod')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
LL_USERNAME = os.environ.get('LL_USERNAME', '')
LL_PASSWORD = os.environ.get('LL_PASSWORD', '')

LL_CATEGORIES = [
    'AMER HIST', 'WORLD HIST', 'SCIENCE', 'LITERATURE', 'ART',
    'GEOGRAPHY', 'ENTERTAINMENT', 'POP MUSIC', 'CLASS MUSIC',
    'FOOD/DRINK', 'GAMES/SPORT', 'BUS/ECON', 'LIFESTYLE',
    'LANGUAGE', 'MATH', 'FILM', 'TV', 'THEATRE'
]

SEED_FILE = os.path.join(BASE_DIR, 'data', 'questions_seed.json')
