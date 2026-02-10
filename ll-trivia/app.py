import threading
from datetime import datetime

import anthropic
from flask import Flask, render_template, request, jsonify
from sqlalchemy import func

import config
from models import init_db, Session, Question, StudyProgress
from scraper import scrape_season_range

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Track background scrape jobs
scrape_status = {"running": False, "messages": [], "result": None}
scrape_lock = threading.Lock()


@app.before_request
def ensure_db():
    init_db()


# ── Dashboard ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    db = Session()
    try:
        total_questions = db.query(Question).count()

        category_counts = (
            db.query(Question.category, func.count(Question.id))
            .group_by(Question.category)
            .order_by(func.count(Question.id).desc())
            .all()
        )

        total_studied = (
            db.query(StudyProgress)
            .filter(StudyProgress.times_seen > 0)
            .count()
        )

        due_for_review = (
            db.query(StudyProgress)
            .filter(StudyProgress.next_review_at <= datetime.utcnow())
            .count()
        )

        recent_questions = (
            db.query(Question)
            .order_by(Question.created_at.desc())
            .limit(5)
            .all()
        )

        return render_template(
            "index.html",
            total_questions=total_questions,
            category_counts=category_counts,
            total_studied=total_studied,
            due_for_review=due_for_review,
            recent_questions=recent_questions,
        )
    finally:
        db.close()


# ── Study ────────────────────────────────────────────────────────────────────

@app.route("/study")
def study():
    categories = _get_categories()
    return render_template("study.html", categories=categories)


@app.route("/api/questions")
def api_questions():
    db = Session()
    try:
        category = request.args.get("category")
        difficulty = request.args.get("difficulty")
        mode = request.args.get("mode", "review")  # review, all, unseen
        limit = request.args.get("limit", 20, type=int)

        query = db.query(Question)

        if category:
            query = query.filter(Question.category == category)

        if difficulty and mode != "mountain":
            if difficulty == "easy":
                query = query.filter(Question.percent_correct >= 70)
            elif difficulty == "medium":
                query = query.filter(
                    Question.percent_correct >= 30,
                    Question.percent_correct < 70,
                )
            elif difficulty == "hard":
                query = query.filter(Question.percent_correct < 30)

        if mode == "review":
            # Due for review first, then unseen, then others
            # Get IDs of questions due for review
            due_ids = [
                sp.question_id
                for sp in db.query(StudyProgress)
                .filter(StudyProgress.next_review_at <= datetime.utcnow())
                .all()
            ]
            # Get IDs of questions never seen
            seen_ids = [
                sp.question_id
                for sp in db.query(StudyProgress)
                .filter(StudyProgress.times_seen > 0)
                .all()
            ]

            # Build ordered list: due first, then unseen, then rest
            all_q = query.all()
            due = [q for q in all_q if q.id in due_ids]
            unseen = [q for q in all_q if q.id not in seen_ids]
            rest = [q for q in all_q if q.id not in due_ids and q.id in seen_ids]

            ordered = due + unseen + rest
            questions = ordered[:limit]
        elif mode == "unseen":
            seen_ids = [
                sp.question_id
                for sp in db.query(StudyProgress)
                .filter(StudyProgress.times_seen > 0)
                .all()
            ]
            questions = query.filter(~Question.id.in_(seen_ids)).limit(limit).all()
        elif mode == "mountain":
            if not category:
                return jsonify({"error": "Category is required for Climb the Mountain mode"}), 400
            questions = (
                query
                .filter(Question.percent_correct.isnot(None))
                .order_by(Question.percent_correct.desc())
                .limit(100)
                .all()
            )
            null_pct = query.filter(Question.percent_correct.is_(None)).all()
            questions.extend(null_pct[:max(0, 100 - len(questions))])
        else:
            questions = query.limit(limit).all()

        result = []
        for q in questions:
            d = q.to_dict()
            if q.progress:
                d["progress"] = q.progress.to_dict()
            else:
                d["progress"] = None
            result.append(d)

        return jsonify(result)
    finally:
        db.close()


@app.route("/api/progress", methods=["POST"])
def api_progress():
    data = request.get_json()
    question_id = data.get("question_id")
    correct = data.get("correct", False)
    confidence = data.get("confidence", 1)

    db = Session()
    try:
        progress = (
            db.query(StudyProgress)
            .filter_by(question_id=question_id)
            .first()
        )
        if not progress:
            progress = StudyProgress(question_id=question_id)
            db.add(progress)

        progress.record_attempt(correct, confidence)
        db.commit()
        return jsonify(progress.to_dict())
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Import ───────────────────────────────────────────────────────────────────

@app.route("/import")
def import_page():
    return render_template("import.html", status=scrape_status)


@app.route("/import/scrape", methods=["POST"])
def import_scrape():
    with scrape_lock:
        if scrape_status["running"]:
            return jsonify({"error": "A scrape is already running"}), 409

    start = request.form.get("start_season", type=int)
    end = request.form.get("end_season", type=int)

    if not start or not end or start > end:
        return jsonify({"error": "Invalid season range"}), 400

    username = request.form.get("username") or config.LL_USERNAME
    password = request.form.get("password") or config.LL_PASSWORD

    if not username or not password:
        return jsonify({"error": "Credentials required"}), 400

    with scrape_lock:
        scrape_status["running"] = True
        scrape_status["messages"] = []
        scrape_status["result"] = None

    def run_scrape():
        def on_message(msg):
            with scrape_lock:
                scrape_status["messages"].append(msg)

        try:
            result = scrape_season_range(
                start, end,
                username=username,
                password=password,
                progress_callback=on_message,
            )
            with scrape_lock:
                scrape_status["result"] = result
        except Exception as e:
            with scrape_lock:
                scrape_status["messages"].append(f"Fatal error: {e}")
                scrape_status["result"] = {"error": str(e)}
        finally:
            with scrape_lock:
                scrape_status["running"] = False

    thread = threading.Thread(target=run_scrape, daemon=True)
    thread.start()

    return jsonify({"status": "started"})


@app.route("/import/status")
def import_status():
    with scrape_lock:
        return jsonify({
            "running": scrape_status["running"],
            "messages": scrape_status["messages"][-50:],
            "result": scrape_status["result"],
        })


# ── Stats ────────────────────────────────────────────────────────────────────

@app.route("/stats")
def stats():
    db = Session()
    try:
        # Overall stats
        total_questions = db.query(Question).count()
        total_studied = (
            db.query(StudyProgress)
            .filter(StudyProgress.times_seen > 0)
            .count()
        )
        total_seen = db.query(func.sum(StudyProgress.times_seen)).scalar() or 0
        total_correct = db.query(func.sum(StudyProgress.times_correct)).scalar() or 0

        # By category
        category_stats = []
        categories = (
            db.query(Question.category, func.count(Question.id))
            .group_by(Question.category)
            .order_by(Question.category)
            .all()
        )
        for cat, count in categories:
            progress_rows = (
                db.query(StudyProgress)
                .join(Question)
                .filter(Question.category == cat, StudyProgress.times_seen > 0)
                .all()
            )
            seen = len(progress_rows)
            correct = sum(p.times_correct for p in progress_rows)
            attempts = sum(p.times_seen for p in progress_rows)
            accuracy = (correct / attempts * 100) if attempts > 0 else 0
            category_stats.append({
                "category": cat,
                "total": count,
                "studied": seen,
                "accuracy": round(accuracy, 1),
            })

        # Confidence distribution
        confidence_dist = (
            db.query(StudyProgress.confidence, func.count(StudyProgress.id))
            .filter(StudyProgress.times_seen > 0)
            .group_by(StudyProgress.confidence)
            .all()
        )
        confidence_map = {1: "Hard", 2: "Medium", 3: "Easy"}
        confidence_data = [
            {"label": confidence_map.get(c, "?"), "count": n}
            for c, n in confidence_dist
        ]

        # Due for review
        due_count = (
            db.query(StudyProgress)
            .filter(StudyProgress.next_review_at <= datetime.utcnow())
            .count()
        )

        # Weakest categories (lowest accuracy, min 3 attempts)
        weakest = sorted(
            [c for c in category_stats if c["studied"] >= 1],
            key=lambda c: c["accuracy"],
        )[:5]

        return render_template(
            "stats.html",
            total_questions=total_questions,
            total_studied=total_studied,
            total_seen=total_seen,
            total_correct=total_correct,
            overall_accuracy=round(total_correct / total_seen * 100, 1) if total_seen > 0 else 0,
            category_stats=category_stats,
            confidence_data=confidence_data,
            due_count=due_count,
            weakest=weakest,
        )
    finally:
        db.close()


# ── Learn More ──────────────────────────────────────────────────────────────

@app.route("/api/learn-more", methods=["POST"])
def api_learn_more():
    data = request.get_json()
    question_text = data.get("question_text", "")
    answer = data.get("answer", "")
    category = data.get("category", "")

    if not question_text or not answer:
        return jsonify({"error": "Missing question or answer"}), 400

    if not config.ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not set"}), 500

    prompt = (
        f"I am a college student who is studying for quizbowl. "
        f"This is a question I don't understand, can you provide a 3 paragraph "
        f"background on this question and answer that will help me learn?\n\n"
        f"Category: {category}\n"
        f"Question: {question_text}\n"
        f"Answer: {answer}"
    )

    try:
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text
        return jsonify({"explanation": response_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_categories():
    db = Session()
    try:
        rows = (
            db.query(Question.category)
            .distinct()
            .order_by(Question.category)
            .all()
        )
        return [r[0] for r in rows]
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
