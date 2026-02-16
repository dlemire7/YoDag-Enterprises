import csv
import io
import json
import os
import threading
from datetime import datetime, timedelta

from flask import Blueprint, Flask, Response, jsonify, request
from flask_cors import CORS

from config import (ANTHROPIC_API_KEY, LL_CATEGORIES, SECRET_KEY,
                    SEED_FILE, SQLALCHEMY_DATABASE_URI)
from models import (AIResponse, AppSettings, Bookmark, DailyActivity,
                    Question, QuestionNote, QuestionTag, SessionAnswer,
                    StudyProgress, StudySession, db)

# ---------------------------------------------------------------------------
# Scrape status (module-level, shared with background thread)
# ---------------------------------------------------------------------------
scrape_status_lock = threading.Lock()
scrape_status = {
    'running': False,
    'messages': [],
    'result': None,
}

# ---------------------------------------------------------------------------
# Blueprint
# ---------------------------------------------------------------------------
api = Blueprint('api', __name__)


# ===========================================================================
# QUESTIONS
# ===========================================================================

@api.route('/api/v1/questions', methods=['GET'])
def list_questions():
    category = request.args.get('category')
    subcategory = request.args.get('subcategory')
    difficulty = request.args.get('difficulty')
    mode = request.args.get('mode', 'all')
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)

    query = Question.query

    # Category filter
    if category:
        query = query.filter(Question.category == category)

    # Subcategory filter
    if subcategory:
        query = query.filter(Question.subcategory == subcategory)

    # Difficulty filter (based on percent_correct)
    if difficulty == 'easy':
        query = query.filter(Question.percent_correct >= 70)
    elif difficulty == 'medium':
        query = query.filter(Question.percent_correct >= 30,
                             Question.percent_correct < 70)
    elif difficulty == 'hard':
        query = query.filter(Question.percent_correct < 30)

    # Mode filter
    if mode == 'review':
        now = datetime.utcnow()
        query = (query
                 .outerjoin(StudyProgress)
                 .filter(
                     db.or_(
                         StudyProgress.next_review_at <= now,
                         StudyProgress.id.is_(None)
                     )
                 )
                 .order_by(
                     db.case(
                         (StudyProgress.next_review_at.isnot(None), 0),
                         else_=1
                     ).asc(),
                     StudyProgress.next_review_at.asc()
                 ))
    elif mode == 'unseen':
        query = (query
                 .outerjoin(StudyProgress)
                 .filter(StudyProgress.id.is_(None)))
    elif mode == 'bookmarked':
        query = query.join(Bookmark)

    # Get total before pagination
    total = query.count()

    questions = query.offset(offset).limit(limit).all()

    return jsonify({
        'questions': [q.to_dict() for q in questions],
        'total': total,
    })


@api.route('/api/v1/questions/<int:question_id>', methods=['GET'])
def get_question(question_id):
    question = Question.query.get_or_404(question_id)

    result = question.to_dict()
    result['progress'] = question.progress.to_dict() if question.progress else None
    result['notes'] = question.notes.to_dict() if question.notes else None
    result['tags'] = [t.tag for t in question.tags] if question.tags else []
    result['bookmarked'] = question.bookmark is not None

    return jsonify(result)


# ===========================================================================
# SUBCATEGORIES
# ===========================================================================

@api.route('/api/v1/subcategories', methods=['GET'])
def list_subcategories():
    category = request.args.get('category')
    if not category:
        return jsonify({'error': 'category parameter required'}), 400

    results = (db.session.query(
        Question.subcategory,
        db.func.count(Question.id)
    )
        .filter(Question.category == category,
                Question.subcategory.isnot(None))
        .group_by(Question.subcategory)
        .order_by(Question.subcategory)
        .all())

    return jsonify([
        {'subcategory': name, 'count': count}
        for name, count in results
    ])


# ===========================================================================
# STUDY PROGRESS
# ===========================================================================

@api.route('/api/v1/progress', methods=['POST'])
def record_progress():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    question_id = data.get('question_id')
    confidence = data.get('confidence')

    if question_id is None or confidence is None:
        return jsonify({'error': 'question_id and confidence required'}), 400
    if confidence not in (1, 2, 3, 4):
        return jsonify({'error': 'confidence must be 1-4'}), 400

    # Verify question exists
    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': 'Question not found'}), 404

    # Get or create progress
    progress = StudyProgress.query.filter_by(question_id=question_id).first()
    if not progress:
        progress = StudyProgress(question_id=question_id)
        db.session.add(progress)

    progress.record_attempt(confidence)

    # Update daily activity
    today_str = datetime.utcnow().strftime('%Y-%m-%d')
    daily = DailyActivity.query.get(today_str)
    if not daily:
        daily = DailyActivity(date=today_str)
        db.session.add(daily)
    daily.questions_studied += 1
    if confidence >= 3:
        daily.questions_correct += 1

    db.session.commit()
    return jsonify(progress.to_dict())


# ===========================================================================
# STUDY SESSIONS
# ===========================================================================

@api.route('/api/v1/sessions', methods=['POST'])
def create_session():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    mode = data.get('mode')
    if mode not in ('flashcard', 'quiz', 'revenge', 'deep_dive'):
        return jsonify({'error': 'Invalid mode'}), 400

    session = StudySession(
        mode=mode,
        settings_json=data.get('settings_json'),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@api.route('/api/v1/sessions/<int:session_id>', methods=['PUT'])
def update_session(session_id):
    session = StudySession.query.get_or_404(session_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    answers = data.get('answers', [])
    for ans in answers:
        sa = SessionAnswer(
            session_id=session.id,
            question_id=ans['question_id'],
            was_correct=ans['was_correct'],
            confidence=ans.get('confidence'),
        )
        db.session.add(sa)
        session.question_count += 1
        if ans['was_correct']:
            session.correct_count += 1

    if data.get('completed'):
        session.completed_at = datetime.utcnow()

    db.session.commit()
    return jsonify(session.to_dict())


@api.route('/api/v1/sessions', methods=['GET'])
def list_sessions():
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)

    query = StudySession.query.order_by(StudySession.started_at.desc())
    total = query.count()
    sessions = query.offset(offset).limit(limit).all()

    return jsonify({
        'sessions': [s.to_dict() for s in sessions],
        'total': total,
    })


@api.route('/api/v1/sessions/<int:session_id>/answers', methods=['GET'])
def session_answers(session_id):
    session = StudySession.query.get_or_404(session_id)
    answers = (SessionAnswer.query
               .filter_by(session_id=session_id)
               .order_by(SessionAnswer.answered_at.asc())
               .all())

    result = []
    for ans in answers:
        q = Question.query.get(ans.question_id)
        d = ans.to_dict()
        if q:
            d['question'] = q.to_dict()
        result.append(d)

    return jsonify({
        'session': session.to_dict(),
        'answers': result,
    })


# ===========================================================================
# BOOKMARKS
# ===========================================================================

@api.route('/api/v1/bookmarks/<int:question_id>', methods=['POST'])
def toggle_bookmark(question_id):
    # Verify question exists
    Question.query.get_or_404(question_id)

    existing = Bookmark.query.filter_by(question_id=question_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'bookmarked': False})
    else:
        bm = Bookmark(question_id=question_id)
        db.session.add(bm)
        db.session.commit()
        return jsonify({'bookmarked': True})


# ===========================================================================
# NOTES
# ===========================================================================

@api.route('/api/v1/questions/<int:question_id>/notes', methods=['PUT'])
def update_note(question_id):
    Question.query.get_or_404(question_id)
    data = request.get_json()
    if not data or 'note_text' not in data:
        return jsonify({'error': 'note_text required'}), 400

    note = QuestionNote.query.filter_by(question_id=question_id).first()
    if note:
        note.note_text = data['note_text']
        note.updated_at = datetime.utcnow()
    else:
        note = QuestionNote(question_id=question_id,
                            note_text=data['note_text'])
        db.session.add(note)

    db.session.commit()
    return jsonify(note.to_dict())


# ===========================================================================
# TAGS
# ===========================================================================

@api.route('/api/v1/questions/<int:question_id>/tags', methods=['POST'])
def add_tag(question_id):
    Question.query.get_or_404(question_id)
    data = request.get_json()
    if not data or 'tag' not in data:
        return jsonify({'error': 'tag required'}), 400

    tag_text = data['tag'].strip()
    if not tag_text:
        return jsonify({'error': 'tag cannot be empty'}), 400

    # Check for duplicate
    existing = QuestionTag.query.filter_by(
        question_id=question_id, tag=tag_text).first()
    if not existing:
        qt = QuestionTag(question_id=question_id, tag=tag_text)
        db.session.add(qt)
        db.session.commit()

    all_tags = QuestionTag.query.filter_by(question_id=question_id).all()
    return jsonify({'tags': [t.tag for t in all_tags]})


@api.route('/api/v1/questions/<int:question_id>/tags/<tag>', methods=['DELETE'])
def delete_tag(question_id, tag):
    Question.query.get_or_404(question_id)

    qt = QuestionTag.query.filter_by(
        question_id=question_id, tag=tag).first()
    if qt:
        db.session.delete(qt)
        db.session.commit()

    remaining = QuestionTag.query.filter_by(question_id=question_id).all()
    return jsonify({'tags': [t.tag for t in remaining]})


# ===========================================================================
# STATS
# ===========================================================================

@api.route('/api/v1/stats/overview', methods=['GET'])
def stats_overview():
    total_questions = Question.query.count()
    total_studied = StudyProgress.query.filter(
        StudyProgress.times_seen > 0).count()

    now = datetime.utcnow()
    total_due = StudyProgress.query.filter(
        StudyProgress.next_review_at <= now).count()
    # Also count unseen as due
    unseen_count = total_questions - StudyProgress.query.count()
    total_due += unseen_count

    # Accuracy
    result = db.session.query(
        db.func.sum(StudyProgress.times_correct),
        db.func.sum(StudyProgress.times_seen)
    ).first()
    total_correct = result[0] or 0
    total_seen = result[1] or 0
    accuracy_pct = round((total_correct / total_seen * 100), 1) if total_seen > 0 else 0

    # Questions studied today
    today_str = datetime.utcnow().strftime('%Y-%m-%d')
    daily = DailyActivity.query.get(today_str)
    questions_today = daily.questions_studied if daily else 0

    # Streaks
    current_streak = 0
    longest_streak = 0
    activities = (DailyActivity.query
                  .filter(DailyActivity.questions_studied > 0)
                  .order_by(DailyActivity.date.desc())
                  .all())

    if activities:
        streak = 0
        expected_date = datetime.utcnow().date()
        # Allow today to not have activity yet (check yesterday too)
        first_activity_date = datetime.strptime(activities[0].date, '%Y-%m-%d').date()
        if first_activity_date == expected_date:
            pass  # started today
        elif first_activity_date == expected_date - timedelta(days=1):
            expected_date = expected_date - timedelta(days=1)
        else:
            expected_date = None  # streak broken

        if expected_date is not None:
            for act in activities:
                act_date = datetime.strptime(act.date, '%Y-%m-%d').date()
                if act_date == expected_date:
                    streak += 1
                    expected_date -= timedelta(days=1)
                else:
                    break
        current_streak = streak

        # Longest streak: iterate all dates sorted ascending
        sorted_acts = sorted(activities, key=lambda a: a.date)
        temp_streak = 1
        longest_streak = 1
        for i in range(1, len(sorted_acts)):
            prev = datetime.strptime(sorted_acts[i - 1].date, '%Y-%m-%d').date()
            curr = datetime.strptime(sorted_acts[i].date, '%Y-%m-%d').date()
            if (curr - prev).days == 1:
                temp_streak += 1
                longest_streak = max(longest_streak, temp_streak)
            else:
                temp_streak = 1
        if not activities:
            longest_streak = 0

    return jsonify({
        'total_questions': total_questions,
        'total_studied': total_studied,
        'total_due': total_due,
        'accuracy_pct': accuracy_pct,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'questions_today': questions_today,
    })


@api.route('/api/v1/stats/categories', methods=['GET'])
def stats_categories():
    results = []
    for cat in LL_CATEGORIES:
        total = Question.query.filter_by(category=cat).count()

        studied_q = (db.session.query(db.func.count(StudyProgress.id))
                     .join(Question)
                     .filter(Question.category == cat,
                             StudyProgress.times_seen > 0)
                     .scalar())

        acc_data = (db.session.query(
            db.func.sum(StudyProgress.times_correct),
            db.func.sum(StudyProgress.times_seen)
        ).join(Question)
         .filter(Question.category == cat)
         .first())

        tc = acc_data[0] or 0
        ts = acc_data[1] or 0
        accuracy_pct = round((tc / ts * 100), 1) if ts > 0 else 0

        # Mastery: confidence >= 3 AND interval_days >= 7
        mastery_count = (db.session.query(db.func.count(StudyProgress.id))
                         .join(Question)
                         .filter(Question.category == cat,
                                 StudyProgress.confidence >= 3,
                                 StudyProgress.interval_days >= 7)
                         .scalar())
        mastery_pct = round((mastery_count / total * 100), 1) if total > 0 else 0

        results.append({
            'category': cat,
            'total': total,
            'studied': studied_q,
            'accuracy_pct': accuracy_pct,
            'mastery_pct': mastery_pct,
        })

    return jsonify(results)


@api.route('/api/v1/stats/trends', methods=['GET'])
def stats_trends():
    days = request.args.get('days', 30, type=int)
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)

    activities = (DailyActivity.query
                  .filter(DailyActivity.date >= start_date.isoformat(),
                          DailyActivity.date <= end_date.isoformat())
                  .order_by(DailyActivity.date.asc())
                  .all())

    # Build lookup
    act_map = {a.date: a for a in activities}

    dates = []
    accuracy = []
    count = []
    current = start_date
    while current <= end_date:
        date_str = current.isoformat()
        dates.append(date_str)
        act = act_map.get(date_str)
        if act and act.questions_studied > 0:
            count.append(act.questions_studied)
            accuracy.append(
                round(act.questions_correct / act.questions_studied * 100, 1))
        else:
            count.append(0)
            accuracy.append(0)
        current += timedelta(days=1)

    return jsonify({
        'dates': dates,
        'accuracy': accuracy,
        'count': count,
    })


@api.route('/api/v1/stats/heatmap', methods=['GET'])
def stats_heatmap():
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=364)

    activities = (DailyActivity.query
                  .filter(DailyActivity.date >= start_date.isoformat(),
                          DailyActivity.date <= end_date.isoformat())
                  .all())

    act_map = {a.date: a.questions_studied for a in activities}

    result = []
    current = start_date
    while current <= end_date:
        date_str = current.isoformat()
        result.append({
            'date': date_str,
            'count': act_map.get(date_str, 0),
        })
        current += timedelta(days=1)

    return jsonify(result)


@api.route('/api/v1/stats/weakest', methods=['GET'])
def stats_weakest():
    progress_list = (StudyProgress.query
                     .filter(StudyProgress.times_seen > 0)
                     .all())

    # Calculate accuracy and sort
    scored = []
    for p in progress_list:
        acc = p.times_correct / p.times_seen if p.times_seen > 0 else 0
        scored.append((p, acc))

    scored.sort(key=lambda x: x[1])
    top_20 = scored[:20]

    results = []
    for p, acc in top_20:
        q = Question.query.get(p.question_id)
        if q:
            d = q.to_dict()
            d['progress'] = p.to_dict()
            d['accuracy'] = round(acc * 100, 1)
            results.append(d)

    return jsonify(results)


# ===========================================================================
# AI / LEARN MORE
# ===========================================================================

@api.route('/api/v1/learn-more', methods=['POST'])
def learn_more():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    question_id = data.get('question_id')
    mode = data.get('mode')

    if not question_id or mode not in ('quick', 'deep_dive', 'quiz_bowl'):
        return jsonify({'error': 'question_id and valid mode required'}), 400

    question = Question.query.get(question_id)
    if not question:
        return jsonify({'error': 'Question not found'}), 404

    # Check cache
    cached = AIResponse.query.filter_by(
        question_id=question_id, mode=mode).first()
    if cached:
        return jsonify(cached.to_dict())

    # Build prompt
    if mode == 'quick':
        prompt = (
            f"I'm studying trivia. Give me a brief, memorable explanation for "
            f"why the answer to this question is what it is. Include a helpful "
            f"mnemonic or memory trick if possible.\n\n"
            f"Category: {question.category}\n"
            f"Question: {question.question_text}\n"
            f"Answer: {question.answer}\n\n"
            f"Keep your response concise (2-3 paragraphs max)."
        )
    elif mode == 'deep_dive':
        prompt = (
            f"I'm studying trivia and want a deep dive on this topic. "
            f"Provide comprehensive background information, historical context, "
            f"related facts, and connections to other trivia topics.\n\n"
            f"Category: {question.category}\n"
            f"Question: {question.question_text}\n"
            f"Answer: {question.answer}\n\n"
            f"Be thorough and educational. Include interesting tangential facts "
            f"that might help with other trivia questions."
        )
    elif mode == 'quiz_bowl':
        prompt = (
            f"Based on this trivia question and answer, generate 5 related "
            f"trivia questions with answers that test related knowledge. "
            f"Format each as 'Q: ... A: ...' on separate lines.\n\n"
            f"Category: {question.category}\n"
            f"Original Question: {question.question_text}\n"
            f"Original Answer: {question.answer}\n\n"
            f"Make the questions progressively harder and cover related topics."
        )

    if not ANTHROPIC_API_KEY:
        return jsonify({'error': 'ANTHROPIC_API_KEY not configured'}), 500

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model='claude-sonnet-4-5-20250929',
            max_tokens=1500,
            messages=[{'role': 'user', 'content': prompt}],
        )
        response_text = message.content[0].text

        ai_resp = AIResponse(
            question_id=question_id,
            mode=mode,
            response_text=response_text,
        )
        db.session.add(ai_resp)
        db.session.commit()
        return jsonify(ai_resp.to_dict())

    except Exception as e:
        return jsonify({'error': f'AI request failed: {str(e)}'}), 500


# ===========================================================================
# AI QUESTION FORGE
# ===========================================================================

@api.route('/api/v1/ai/generate-questions', methods=['POST'])
def generate_questions():
    """Generate practice questions using Claude AI."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    category = data.get('category')
    count = data.get('count', 5)
    difficulty_hint = data.get('difficulty_hint', 'mixed')

    if not category:
        return jsonify({'error': 'category is required'}), 400

    if category not in LL_CATEGORIES:
        return jsonify({'error': f'Unknown category: {category}'}), 400

    count = min(max(int(count), 1), 10)

    if not ANTHROPIC_API_KEY:
        return jsonify({'error': 'ANTHROPIC_API_KEY not configured'}), 500

    # Gather some real questions from this category for context
    sample_questions = (Question.query
                        .filter_by(category=category, is_ai_generated=False)
                        .order_by(db.func.random())
                        .limit(5)
                        .all())

    examples_text = ''
    if sample_questions:
        examples_text = '\n\nHere are some real example questions from this category for style reference:\n'
        for sq in sample_questions:
            examples_text += f'Q: {sq.question_text}\nA: {sq.answer}\n\n'

    difficulty_instruction = {
        'easy': 'Make the questions relatively easy — they should be answerable by someone with general knowledge.',
        'medium': 'Make the questions moderately difficult — they should challenge a well-read person.',
        'hard': 'Make the questions quite difficult — they should challenge even trivia experts.',
        'mixed': 'Vary the difficulty — include some easy, some moderate, and some challenging questions.',
    }.get(difficulty_hint, 'Vary the difficulty.')

    prompt = (
        f"Generate exactly {count} trivia questions in the category '{category}' "
        f"suitable for a LearnedLeague-style trivia competition.\n\n"
        f"{difficulty_instruction}\n\n"
        f"Each question should be a single clear question with a definitive, "
        f"specific factual answer (not multiple choice).\n"
        f"{examples_text}\n"
        f"Return your response as a JSON array of objects, each with exactly "
        f"these fields:\n"
        f'- "question_text": the question\n'
        f'- "answer": the answer\n'
        f'- "difficulty_estimate": a number 0-100 representing estimated percent '
        f'of players who would get it right (higher = easier)\n\n'
        f"Return ONLY the JSON array, no other text."
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model='claude-sonnet-4-5-20250929',
            max_tokens=3000,
            messages=[{'role': 'user', 'content': prompt}],
        )
        response_text = message.content[0].text.strip()

        # Parse JSON from response (handle possible markdown code fences)
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            # Remove first and last lines (``` markers)
            lines = [l for l in lines if not l.strip().startswith('```')]
            response_text = '\n'.join(lines)

        generated = json.loads(response_text)

        if not isinstance(generated, list):
            return jsonify({'error': 'AI returned unexpected format'}), 500

        # Save to DB
        saved_questions = []
        for i, item in enumerate(generated):
            q = Question(
                season=0,
                match_day=0,
                question_number=i + 1,
                question_text=item.get('question_text', ''),
                answer=item.get('answer', ''),
                category=category,
                percent_correct=item.get('difficulty_estimate'),
                is_ai_generated=True,
            )
            db.session.add(q)
            db.session.flush()  # get the ID
            saved_questions.append(q.to_dict())

        db.session.commit()
        return jsonify({
            'questions': saved_questions,
            'count': len(saved_questions),
        })

    except json.JSONDecodeError as e:
        return jsonify({'error': f'Failed to parse AI response: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'AI generation failed: {str(e)}'}), 500


# ===========================================================================
# IMPORT / SCRAPER
# ===========================================================================

@api.route('/api/v1/import/scrape', methods=['POST'])
def start_scrape():
    global scrape_status

    with scrape_status_lock:
        if scrape_status['running']:
            return jsonify({'error': 'Scrape already in progress'}), 409

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    username = data.get('username', '')
    password = data.get('password', '')
    start_season = data.get('start_season')
    end_season = data.get('end_season')

    if not all([username, password, start_season, end_season]):
        return jsonify({
            'error': 'username, password, start_season, end_season required'
        }), 400

    with scrape_status_lock:
        scrape_status = {
            'running': True,
            'messages': ['Starting scrape...'],
            'result': None,
        }

    def _save_callback(questions_list):
        """Persist a batch of scraped questions to the DB."""
        saved = 0
        skipped = 0
        app_inner = create_app()
        with app_inner.app_context():
            for q_data in questions_list:
                # Parse season from string like "LL102" to int 102
                season_raw = q_data.get('season', 0)
                if isinstance(season_raw, str):
                    season_val = int(season_raw.replace('LL', ''))
                else:
                    season_val = int(season_raw)

                existing = Question.query.filter_by(
                    season=season_val,
                    match_day=q_data['match_day'],
                    question_number=q_data['question_number'],
                ).first()
                if existing:
                    skipped += 1
                    continue

                q = Question(
                    season=season_val,
                    match_day=q_data['match_day'],
                    question_number=q_data['question_number'],
                    question_text=q_data.get('question_text', ''),
                    answer=q_data.get('answer', ''),
                    category=q_data.get('category', ''),
                    percent_correct=q_data.get('percent_correct'),
                )
                db.session.add(q)
                saved += 1
            db.session.commit()
        return saved, skipped

    def run_scrape():
        global scrape_status
        try:
            from scraper import scrape_season_range
            result = scrape_season_range(
                start_season=int(start_season),
                end_season=int(end_season),
                username=username,
                password=password,
                progress_callback=_scrape_callback,
                save_callback=_save_callback,
            )

            with scrape_status_lock:
                scrape_status['running'] = False
                scrape_status['result'] = {
                    'total_saved': result.get('total_saved', 0),
                    'total_skipped': result.get('total_skipped', 0),
                    'errors': result.get('errors', []),
                }
                scrape_status['messages'].append(
                    f"Done! Saved {result.get('total_saved', 0)}, "
                    f"skipped {result.get('total_skipped', 0)}.")

        except Exception as e:
            with scrape_status_lock:
                scrape_status['running'] = False
                scrape_status['result'] = {'error': str(e)}
                scrape_status['messages'].append(f'Error: {str(e)}')

    thread = threading.Thread(target=run_scrape, daemon=True)
    thread.start()
    return jsonify({'status': 'started'})


def _scrape_callback(message):
    global scrape_status
    with scrape_status_lock:
        scrape_status['messages'].append(message)


@api.route('/api/v1/import/status', methods=['GET'])
def scrape_status_endpoint():
    with scrape_status_lock:
        return jsonify(scrape_status)


# ===========================================================================
# EXPORT
# ===========================================================================

@api.route('/api/v1/export/json', methods=['GET'])
def export_json():
    questions = Question.query.all()
    data = [q.to_dict() for q in questions]
    output = json.dumps(data, indent=2)
    return Response(
        output,
        mimetype='application/json',
        headers={
            'Content-Disposition': 'attachment; filename=questions_export.json'
        },
    )


@api.route('/api/v1/export/csv', methods=['GET'])
def export_csv():
    results = (db.session.query(Question, StudyProgress)
               .outerjoin(StudyProgress)
               .all())

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'question_id', 'season', 'match_day', 'question_number',
        'question_text', 'answer', 'category', 'percent_correct',
        'times_seen', 'times_correct', 'confidence', 'easiness_factor',
        'interval_days', 'last_studied_at', 'next_review_at',
    ])

    for q, p in results:
        writer.writerow([
            q.id, q.season, q.match_day, q.question_number,
            q.question_text, q.answer, q.category, q.percent_correct,
            p.times_seen if p else 0,
            p.times_correct if p else 0,
            p.confidence if p else 0,
            p.easiness_factor if p else 2.5,
            p.interval_days if p else 1,
            p.last_studied_at.isoformat() if p and p.last_studied_at else '',
            p.next_review_at.isoformat() if p and p.next_review_at else '',
        ])

    csv_bytes = output.getvalue().encode('utf-8')
    return Response(
        csv_bytes,
        mimetype='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename=progress_export.csv'
        },
    )


# ===========================================================================
# SETTINGS
# ===========================================================================

@api.route('/api/v1/settings', methods=['GET'])
def get_settings():
    settings = AppSettings.query.all()
    return jsonify({s.key: s.value for s in settings})


@api.route('/api/v1/settings', methods=['PUT'])
def update_settings():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    for key, value in data.items():
        setting = AppSettings.query.get(key)
        if setting:
            setting.value = str(value)
        else:
            setting = AppSettings(key=key, value=str(value))
            db.session.add(setting)

    db.session.commit()

    settings = AppSettings.query.all()
    return jsonify({s.key: s.value for s in settings})


# ===========================================================================
# DATA MANAGEMENT
# ===========================================================================

@api.route('/api/v1/data/reset-progress', methods=['POST'])
def reset_progress():
    """Delete all study progress, sessions, and daily activity."""
    SessionAnswer.query.delete()
    StudySession.query.delete()
    StudyProgress.query.delete()
    DailyActivity.query.delete()
    db.session.commit()
    return jsonify({'status': 'ok', 'message': 'All progress has been reset.'})


@api.route('/api/v1/data/clear-ai-cache', methods=['POST'])
def clear_ai_cache():
    """Delete all cached AI responses."""
    count = AIResponse.query.delete()
    db.session.commit()
    return jsonify({'status': 'ok', 'cleared': count})


# ===========================================================================
# MANUAL QUESTION ENTRY
# ===========================================================================

@api.route('/api/v1/questions', methods=['POST'])
def add_question():
    """Manually add a question."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    required = ['question_text', 'answer', 'category']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    q = Question(
        season=data.get('season', 0),
        match_day=data.get('match_day', 0),
        question_number=data.get('question_number', 0),
        question_text=data['question_text'],
        answer=data['answer'],
        category=data['category'],
        percent_correct=data.get('percent_correct'),
    )
    db.session.add(q)
    db.session.commit()
    return jsonify(q.to_dict()), 201


# ===========================================================================
# APP FACTORY
# ===========================================================================

def _parse_season(raw):
    """Parse season value to int, handling 'LL60' string format."""
    if isinstance(raw, str):
        return int(raw.replace('LL', ''))
    return int(raw)


def seed_from_file(app):
    """Background seed: load questions from seed JSON if table is empty."""
    with app.app_context():
        if not os.path.exists(SEED_FILE):
            return
        try:
            with open(SEED_FILE, 'r', encoding='utf-8') as f:
                questions_data = json.load(f)

            batch_size = 1000
            for i in range(0, len(questions_data), batch_size):
                batch = questions_data[i:i + batch_size]
                for q_data in batch:
                    q = Question(
                        season=_parse_season(q_data.get('season', 0)),
                        match_day=q_data.get('match_day', 0),
                        question_number=q_data.get('question_number', 0),
                        question_text=q_data.get('question_text', ''),
                        answer=q_data.get('answer', ''),
                        category=q_data.get('category', ''),
                        percent_correct=q_data.get('percent_correct'),
                    )
                    db.session.add(q)
                db.session.commit()
                print(f'Seeded batch {i // batch_size + 1} '
                      f'({min(i + batch_size, len(questions_data))}/{len(questions_data)})')

            print(f'Seeded {len(questions_data)} questions from {SEED_FILE}')
        except Exception as e:
            print(f'Seed error: {e}')
            db.session.rollback()


def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = SECRET_KEY

    db.init_app(app)
    CORS(app)

    app.register_blueprint(api)

    with app.app_context():
        db.create_all()

        # Check if questions table is empty and seed if needed
        if Question.query.count() == 0:
            thread = threading.Thread(
                target=seed_from_file, args=(app,), daemon=True)
            thread.start()

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
