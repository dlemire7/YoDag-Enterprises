from datetime import datetime, timedelta

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Question(db.Model):
    __tablename__ = 'questions'
    __table_args__ = (
        db.UniqueConstraint('season', 'match_day', 'question_number',
                            name='uq_season_matchday_qnum'),
    )

    id = db.Column(db.Integer, primary_key=True)
    season = db.Column(db.Integer, nullable=False)
    match_day = db.Column(db.Integer, nullable=False)
    question_number = db.Column(db.Integer, nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    subcategory = db.Column(db.String(100), nullable=True)
    subcategory_secondary = db.Column(db.String(100), nullable=True)
    percent_correct = db.Column(db.Float, nullable=True)
    is_ai_generated = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    progress = db.relationship('StudyProgress', backref='question',
                               uselist=False, lazy='joined')
    notes = db.relationship('QuestionNote', backref='question',
                            uselist=False, lazy='joined')
    tags = db.relationship('QuestionTag', backref='question', lazy='joined')
    bookmark = db.relationship('Bookmark', backref='question',
                               uselist=False, lazy='joined')
    ai_responses = db.relationship('AIResponse', backref='question',
                                   lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'season': self.season,
            'match_day': self.match_day,
            'question_number': self.question_number,
            'question_text': self.question_text,
            'answer': self.answer,
            'category': self.category,
            'subcategory': self.subcategory,
            'subcategory_secondary': self.subcategory_secondary,
            'percent_correct': self.percent_correct,
            'is_ai_generated': self.is_ai_generated,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class StudyProgress(db.Model):
    __tablename__ = 'study_progress'

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            unique=True, nullable=False)
    times_seen = db.Column(db.Integer, default=0)
    times_correct = db.Column(db.Integer, default=0)
    confidence = db.Column(db.Integer, default=0)
    easiness_factor = db.Column(db.Float, default=2.5)
    interval_days = db.Column(db.Integer, default=1)
    repetition_count = db.Column(db.Integer, default=0)
    last_studied_at = db.Column(db.DateTime, nullable=True)
    next_review_at = db.Column(db.DateTime, nullable=True)

    def record_attempt(self, confidence_rating):
        """Implement the SM-2 spaced repetition algorithm."""
        self.times_seen += 1
        if confidence_rating >= 3:
            self.times_correct += 1

        if confidence_rating == 1:
            # Again: reset
            self.repetition_count = 0
            self.interval_days = 1
            self.easiness_factor = max(1.3, self.easiness_factor - 0.2)

        elif confidence_rating == 2:
            # Hard: reset
            self.repetition_count = 0
            self.interval_days = 1
            self.easiness_factor = max(1.3, self.easiness_factor - 0.15)

        elif confidence_rating == 3:
            # Good
            self.repetition_count += 1
            if self.repetition_count == 1:
                self.interval_days = 1
            elif self.repetition_count == 2:
                self.interval_days = 6
            else:
                self.interval_days = round(self.interval_days * self.easiness_factor)
            self.easiness_factor = min(3.0, self.easiness_factor + 0.1)

        elif confidence_rating == 4:
            # Easy: same as good but with bonus multiplier
            self.repetition_count += 1
            if self.repetition_count == 1:
                self.interval_days = 1
            elif self.repetition_count == 2:
                self.interval_days = 6
            else:
                self.interval_days = round(self.interval_days * self.easiness_factor)
            self.interval_days = round(self.interval_days * 1.3)
            self.easiness_factor = min(3.0, self.easiness_factor + 0.15)

        self.confidence = confidence_rating
        self.last_studied_at = datetime.utcnow()
        self.next_review_at = datetime.utcnow() + timedelta(days=self.interval_days)

    def to_dict(self):
        return {
            'id': self.id,
            'question_id': self.question_id,
            'times_seen': self.times_seen,
            'times_correct': self.times_correct,
            'confidence': self.confidence,
            'easiness_factor': self.easiness_factor,
            'interval_days': self.interval_days,
            'repetition_count': self.repetition_count,
            'last_studied_at': (self.last_studied_at.isoformat()
                                if self.last_studied_at else None),
            'next_review_at': (self.next_review_at.isoformat()
                               if self.next_review_at else None),
        }


class StudySession(db.Model):
    __tablename__ = 'study_sessions'

    id = db.Column(db.Integer, primary_key=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    mode = db.Column(db.String(20), nullable=False)
    question_count = db.Column(db.Integer, default=0)
    correct_count = db.Column(db.Integer, default=0)
    settings_json = db.Column(db.Text, nullable=True)

    answers = db.relationship('SessionAnswer', backref='session', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'started_at': (self.started_at.isoformat()
                           if self.started_at else None),
            'completed_at': (self.completed_at.isoformat()
                             if self.completed_at else None),
            'mode': self.mode,
            'question_count': self.question_count,
            'correct_count': self.correct_count,
            'settings_json': self.settings_json,
        }


class SessionAnswer(db.Model):
    __tablename__ = 'session_answers'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('study_sessions.id'),
                           nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            nullable=False)
    was_correct = db.Column(db.Boolean, nullable=False)
    confidence = db.Column(db.Integer, nullable=True)
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'question_id': self.question_id,
            'was_correct': self.was_correct,
            'confidence': self.confidence,
            'answered_at': (self.answered_at.isoformat()
                            if self.answered_at else None),
        }


class Bookmark(db.Model):
    __tablename__ = 'bookmarks'

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class QuestionNote(db.Model):
    __tablename__ = 'question_notes'

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            unique=True, nullable=False)
    note_text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'question_id': self.question_id,
            'note_text': self.note_text,
            'created_at': (self.created_at.isoformat()
                           if self.created_at else None),
            'updated_at': (self.updated_at.isoformat()
                           if self.updated_at else None),
        }


class QuestionTag(db.Model):
    __tablename__ = 'question_tags'
    __table_args__ = (
        db.UniqueConstraint('question_id', 'tag', name='uq_question_tag'),
    )

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            nullable=False)
    tag = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'question_id': self.question_id,
            'tag': self.tag,
            'created_at': (self.created_at.isoformat()
                           if self.created_at else None),
        }


class DailyActivity(db.Model):
    __tablename__ = 'daily_activity'

    date = db.Column(db.String(10), primary_key=True)  # 'YYYY-MM-DD'
    questions_studied = db.Column(db.Integer, default=0)
    questions_correct = db.Column(db.Integer, default=0)


class AIResponse(db.Model):
    __tablename__ = 'ai_responses'
    __table_args__ = (
        db.UniqueConstraint('question_id', 'mode', name='uq_question_mode'),
    )

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('questions.id'),
                            nullable=False)
    mode = db.Column(db.String(20), nullable=False)
    response_text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'question_id': self.question_id,
            'mode': self.mode,
            'response_text': self.response_text,
            'created_at': (self.created_at.isoformat()
                           if self.created_at else None),
        }


class AppSettings(db.Model):
    __tablename__ = 'app_settings'

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=True)
