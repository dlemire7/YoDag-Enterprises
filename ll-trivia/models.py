from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

import config

engine = create_engine(config.SQLALCHEMY_DATABASE_URI, echo=False)
Session = sessionmaker(bind=engine)
Base = declarative_base()


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True)
    season = Column(String, nullable=False)
    match_day = Column(Integer, nullable=False)
    question_number = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    question_text = Column(String, nullable=False)
    answer = Column(String, nullable=False)
    percent_correct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    progress = relationship("StudyProgress", back_populates="question", uselist=False)

    __table_args__ = (
        UniqueConstraint("season", "match_day", "question_number", name="uq_question"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "season": self.season,
            "match_day": self.match_day,
            "question_number": self.question_number,
            "category": self.category,
            "question_text": self.question_text,
            "answer": self.answer,
            "percent_correct": self.percent_correct,
        }


class StudyProgress(Base):
    __tablename__ = "study_progress"

    id = Column(Integer, primary_key=True)
    question_id = Column(Integer, ForeignKey("questions.id"), unique=True, nullable=False)
    times_seen = Column(Integer, default=0)
    times_correct = Column(Integer, default=0)
    confidence = Column(Integer, default=0)  # 1=hard, 2=medium, 3=easy
    last_studied_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True)

    question = relationship("Question", back_populates="progress")

    def record_attempt(self, correct, confidence):
        self.times_seen += 1
        if correct:
            self.times_correct += 1
        self.confidence = confidence
        self.last_studied_at = datetime.utcnow()

        # SM-2 inspired spacing
        if confidence == 3:  # easy
            self.next_review_at = datetime.utcnow() + timedelta(days=7)
        elif confidence == 2:  # medium
            self.next_review_at = datetime.utcnow() + timedelta(days=3)
        else:  # hard
            self.next_review_at = datetime.utcnow() + timedelta(days=1)

    def to_dict(self):
        return {
            "question_id": self.question_id,
            "times_seen": self.times_seen,
            "times_correct": self.times_correct,
            "confidence": self.confidence,
            "last_studied_at": self.last_studied_at.isoformat() if self.last_studied_at else None,
            "next_review_at": self.next_review_at.isoformat() if self.next_review_at else None,
        }


def init_db():
    Base.metadata.create_all(engine)
    _preload_questions()


def _preload_questions():
    """Load bundled questions from questions_data.json if the DB is empty."""
    import json
    import os

    db = Session()
    try:
        if db.query(Question).count() > 0:
            return

        data_file = os.path.join(config.BASE_DIR, "questions_data.json")
        if not os.path.exists(data_file):
            return

        with open(data_file, "r", encoding="utf-8") as f:
            questions = json.load(f)

        for q in questions:
            db.add(Question(
                season=q["season"],
                match_day=q["match_day"],
                question_number=q["question_number"],
                category=q["category"],
                question_text=q["question_text"],
                answer=q["answer"],
                percent_correct=q.get("percent_correct"),
                created_at=datetime.utcnow(),
            ))
        db.commit()
        print(f"Pre-loaded {len(questions)} questions from questions_data.json")
    except Exception as e:
        db.rollback()
        print(f"Warning: failed to pre-load questions: {e}")
    finally:
        db.close()
