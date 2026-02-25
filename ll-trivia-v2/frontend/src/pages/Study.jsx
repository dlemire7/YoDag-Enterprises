import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORY_COLORS, getCategoryColor } from '../styles/categories';
import {
  getQuestions,
  getQuestion,
  createSession,
  updateSession,
  recordProgress,
  toggleBookmark,
  getStatsCategories,
  getSubcategories,
} from '../api/client';
import Flashcard from '../components/Flashcard';
import RatingButtons from '../components/RatingButtons';
import ProgressBar from '../components/ProgressBar';
import NoteEditor from '../components/NoteEditor';
import TagManager from '../components/TagManager';
import KeyboardShortcutHelp from '../components/KeyboardShortcutHelp';
import QuizTimer from '../components/QuizTimer';
import QuizResults from '../components/QuizResults';
import QuestionForge from '../components/QuestionForge';

const MODES = [
  { key: 'flashcard', label: 'Flashcard' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'revenge', label: 'Revenge' },
  { key: 'deep_dive', label: 'Deep Dive' },
  { key: 'forge', label: 'Forge' },
];

const CATEGORIES = ['All Categories', ...Object.keys(CATEGORY_COLORS)];
const DIFFICULTIES = [
  { value: '', label: 'All Difficulties' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const QUIZ_COUNTS = [10, 20, 50];
const QUIZ_TIMERS = [
  { value: 0, label: 'Unlimited' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

const MODE_TO_API = {
  flashcard: 'all',
  quiz: 'unseen',
  revenge: 'review',
  deep_dive: 'all',
};

const DEFAULT_LIMIT = 20;

// Convert hex color to r,g,b string for rgba() usage
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '128,128,128';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export default function Study() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter / config state
  const [mode, setMode] = useState(() => {
    const m = searchParams.get('mode');
    return MODES.some((mo) => mo.key === m) ? m : 'flashcard';
  });
  const [category, setCategory] = useState(() => searchParams.get('category') || 'All Categories');
  const [subcategory, setSubcategory] = useState(() => searchParams.get('subcategory') || '');
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(() => searchParams.get('difficulty') || '');

  // Quiz-specific config
  const [quizCount, setQuizCount] = useState(20);
  const [quizTimerSec, setQuizTimerSec] = useState(0);

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [streak, setStreak] = useState(0);
  const [answers, setAnswers] = useState([]);       // flashcard: [{question_id, confidence}]
  const [quizAnswers, setQuizAnswers] = useState([]); // quiz: [{question_id, was_correct, time_taken_ms}]
  const [loading, setLoading] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [error, setError] = useState(null);

  // Quiz timing
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [timerKey, setTimerKey] = useState(0); // force timer reset on new question
  const [timerExpired, setTimerExpired] = useState(false);

  // Per-question detail cache
  const [questionDetails, setQuestionDetails] = useState({});

  // UI state
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  // Revenge Match state
  const [categoryStats, setCategoryStats] = useState([]);
  const [revengeNemeses, setRevengeNemeses] = useState([]);
  const [revengeFocus, setRevengeFocus] = useState('all'); // 'all' or a category name
  const [categoryStatsLoading, setCategoryStatsLoading] = useState(false);

  // Deep Dive state
  const [deepDiveCategory, setDeepDiveCategory] = useState(null);

  const isQuizMode = mode === 'quiz';
  const isRevengeMode = mode === 'revenge';
  const isDeepDiveMode = mode === 'deep_dive';
  const isForgeMode = mode === 'forge';
  const currentQuestion = questions[currentIndex] || null;
  const currentDetail = currentQuestion ? questionDetails[currentQuestion.id] : null;

  // Fetch category stats when entering revenge or deep_dive mode
  useEffect(() => {
    if (mode !== 'revenge' && mode !== 'deep_dive') return;
    let cancelled = false;
    setCategoryStatsLoading(true);
    getStatsCategories()
      .then((data) => {
        if (cancelled) return;
        const stats = Array.isArray(data) ? data : data.categories || [];
        setCategoryStats(stats);
        if (mode === 'revenge') {
          const sorted = [...stats]
            .filter((s) => s.studied > 0)
            .sort((a, b) => (a.accuracy_pct ?? 100) - (b.accuracy_pct ?? 100));
          setRevengeNemeses(sorted.slice(0, 5));
        }
      })
      .catch((err) => console.error('Failed to load category stats:', err))
      .finally(() => { if (!cancelled) setCategoryStatsLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  // Fetch subcategories when category changes
  useEffect(() => {
    const effectiveCategory = isDeepDiveMode ? deepDiveCategory : category;
    if (!effectiveCategory || effectiveCategory === 'All Categories') {
      setAvailableSubcategories([]);
      setSubcategory('');
      return;
    }
    let cancelled = false;
    setSubcategoriesLoading(true);
    getSubcategories(effectiveCategory)
      .then((data) => {
        if (cancelled) return;
        setAvailableSubcategories(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) setAvailableSubcategories([]); })
      .finally(() => { if (!cancelled) setSubcategoriesLoading(false); });
    return () => { cancelled = true; };
  }, [category, deepDiveCategory, isDeepDiveMode]);

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory('');
  }, [category, deepDiveCategory]);

  // Sync state to URL params
  useEffect(() => {
    const params = {};
    if (mode !== 'flashcard') params.mode = mode;
    if (category !== 'All Categories') params.category = category;
    if (subcategory) params.subcategory = subcategory;
    if (difficulty) params.difficulty = difficulty;
    setSearchParams(params, { replace: true });
  }, [mode, category, subcategory, difficulty, setSearchParams]);

  // Fetch full question details when currentQuestion changes
  useEffect(() => {
    if (!currentQuestion) return;
    if (questionDetails[currentQuestion.id]) return;

    let cancelled = false;
    getQuestion(currentQuestion.id)
      .then((data) => {
        if (cancelled) return;
        setQuestionDetails((prev) => ({
          ...prev,
          [currentQuestion.id]: {
            bookmarked: data.bookmarked || false,
            notes: data.notes || null,
            tags: data.tags || [],
            progress: data.progress || null,
          },
        }));
      })
      .catch((err) => console.error('Failed to load question details:', err));

    return () => { cancelled = true; };
  }, [currentQuestion, questionDetails]);

  // Start question timer when card changes in quiz mode
  useEffect(() => {
    if (isQuizMode && currentQuestion && sessionId) {
      setQuestionStartTime(Date.now());
      setTimerKey((k) => k + 1);
      setTimerExpired(false);
    }
  }, [currentIndex, isQuizMode, currentQuestion, sessionId]);

  // ---- Actions ----

  const startSession = async () => {
    setError(null);
    setLoading(true);
    try {
      const limit = isQuizMode ? quizCount : DEFAULT_LIMIT;
      const settings = {};
      if (category !== 'All Categories') settings.category = category;
      if (difficulty) settings.difficulty = difficulty;
      if (isQuizMode) {
        settings.quiz_count = quizCount;
        settings.quiz_timer = quizTimerSec;
      }

      // Deep Dive: require a category selection
      if (isDeepDiveMode && !deepDiveCategory) {
        setError('Please select a category for Deep Dive mode.');
        setLoading(false);
        return;
      }

      // Deep Dive: override category with selected category
      if (isDeepDiveMode) {
        settings.category = deepDiveCategory;
      }

      // Revenge: override category with focus category
      if (isRevengeMode && revengeFocus !== 'all') {
        settings.category = revengeFocus;
      }

      const session = await createSession(isQuizMode ? 'quiz' : mode, settings);
      setSessionId(session.id);

      const params = { limit };
      if (isDeepDiveMode) {
        params.category = deepDiveCategory;
      } else if (isRevengeMode && revengeFocus !== 'all') {
        params.category = revengeFocus;
      } else if (category !== 'All Categories') {
        params.category = category;
      }
      if (subcategory) params.subcategory = subcategory;
      if (difficulty) params.difficulty = difficulty;
      params.mode = MODE_TO_API[mode] || 'all';

      const data = await getQuestions(params);
      if (!data.questions || data.questions.length === 0) {
        setError('No questions found matching your filters. Try adjusting your category or difficulty.');
        setLoading(false);
        return;
      }

      let sortedQuestions = data.questions;

      // Deep Dive: sort by difficulty (easiest first — highest percent_correct first)
      if (isDeepDiveMode) {
        sortedQuestions = [...data.questions].sort(
          (a, b) => (b.percent_correct ?? 50) - (a.percent_correct ?? 50)
        );
      }

      setQuestions(sortedQuestions);
      setCurrentIndex(0);
      setIsFlipped(false);
      setStreak(0);
      setAnswers([]);
      setQuizAnswers([]);
      setSessionComplete(false);
      setQuestionDetails({});
      setNoteExpanded(false);
    } catch (err) {
      setError(err.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const flipCard = useCallback(() => {
    if (!currentQuestion || isFlipped) return;
    setIsFlipped(true);
  }, [currentQuestion, isFlipped]);

  const advanceOrComplete = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
      setNoteExpanded(false);
    } else {
      setSessionComplete(true);
    }
  }, [currentIndex, questions.length]);

  // Flashcard rating handler
  const handleRate = useCallback(async (confidence) => {
    if (!currentQuestion || !sessionId) return;

    try {
      const progressResult = await recordProgress(currentQuestion.id, confidence);
      setQuestionDetails((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          progress: progressResult,
        },
      }));
    } catch (err) {
      console.error('Failed to record progress:', err);
    }

    if (confidence >= 3) {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }

    const newAnswers = [...answers, { question_id: currentQuestion.id, confidence }];
    setAnswers(newAnswers);

    try {
      const isLast = currentIndex >= questions.length - 1;
      await updateSession(sessionId, {
        answers: [{ question_id: currentQuestion.id, was_correct: confidence >= 3, confidence }],
        completed: isLast,
      });
    } catch (err) {
      console.error('Failed to update session:', err);
    }

    advanceOrComplete();
  }, [currentQuestion, sessionId, answers, currentIndex, questions.length, advanceOrComplete]);

  // Quiz correct/incorrect handler
  const handleQuizAnswer = useCallback(async (wasCorrect) => {
    if (!currentQuestion || !sessionId) return;

    const timeTaken = questionStartTime ? Date.now() - questionStartTime : 0;

    // Record to SM-2 as well: correct = confidence 3, incorrect = confidence 1
    const confidence = wasCorrect ? 3 : 1;
    try {
      await recordProgress(currentQuestion.id, confidence);
    } catch (err) {
      console.error('Failed to record progress:', err);
    }

    if (wasCorrect) {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }

    const newAnswer = {
      question_id: currentQuestion.id,
      was_correct: wasCorrect,
      time_taken_ms: timeTaken,
    };
    const newQuizAnswers = [...quizAnswers, newAnswer];
    setQuizAnswers(newQuizAnswers);

    try {
      const isLast = currentIndex >= questions.length - 1;
      await updateSession(sessionId, {
        answers: [{ question_id: currentQuestion.id, was_correct: wasCorrect, confidence }],
        completed: isLast,
      });
    } catch (err) {
      console.error('Failed to update session:', err);
    }

    advanceOrComplete();
  }, [currentQuestion, sessionId, questionStartTime, quizAnswers, currentIndex, questions.length, advanceOrComplete]);

  // Timer expired — auto-flip and mark as incorrect
  const handleTimeUp = useCallback(() => {
    if (!isFlipped) {
      setIsFlipped(true);
      setTimerExpired(true);
    }
  }, [isFlipped]);

  const skipQuestion = useCallback(() => {
    if (!currentQuestion) return;
    advanceOrComplete();
  }, [currentQuestion, advanceOrComplete]);

  const handleToggleBookmark = useCallback(async () => {
    if (!currentQuestion) return;
    try {
      const result = await toggleBookmark(currentQuestion.id);
      setQuestionDetails((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          bookmarked: result.bookmarked,
        },
      }));
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  }, [currentQuestion]);

  const handleNoteSaved = useCallback((noteText) => {
    if (!currentQuestion) return;
    setQuestionDetails((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        notes: noteText,
      },
    }));
  }, [currentQuestion]);

  const handleTagsChanged = useCallback((newTags) => {
    if (!currentQuestion) return;
    setQuestionDetails((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        tags: newTags,
      },
    }));
  }, [currentQuestion]);

  const resetSession = () => {
    setSessionId(null);
    setQuestions([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStreak(0);
    setAnswers([]);
    setQuizAnswers([]);
    setSessionComplete(false);
    setQuestionDetails({});
    setError(null);
    setNoteExpanded(false);
    setTimerExpired(false);
    setRevengeFocus('all');
    setDeepDiveCategory(null);
    setSubcategory('');
  };

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (showShortcutHelp) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          flipCard();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          if (isFlipped && currentQuestion && !sessionComplete && !isQuizMode) {
            e.preventDefault();
            handleRate(parseInt(e.key, 10));
          }
          break;
        case 'y':
        case 'Y':
          if (isFlipped && currentQuestion && !sessionComplete && isQuizMode) {
            e.preventDefault();
            handleQuizAnswer(true);
          }
          break;
        case 'x':
        case 'X':
          if (isFlipped && currentQuestion && !sessionComplete && isQuizMode) {
            e.preventDefault();
            handleQuizAnswer(false);
          }
          break;
        case 's':
        case 'S':
        case 'ArrowRight':
          if (currentQuestion && !sessionComplete) {
            e.preventDefault();
            skipQuestion();
          }
          break;
        case 'b':
        case 'B':
          if (currentQuestion) {
            e.preventDefault();
            handleToggleBookmark();
          }
          break;
        case 'n':
        case 'N':
          if (currentQuestion) {
            e.preventDefault();
            setNoteExpanded((v) => !v);
          }
          break;
        case '?':
          e.preventDefault();
          setShowShortcutHelp(true);
          break;
        case 'Escape':
          setShowShortcutHelp(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flipCard, handleRate, handleQuizAnswer, skipQuestion, handleToggleBookmark,
      isFlipped, currentQuestion, sessionComplete, showShortcutHelp, isQuizMode]);

  // ---- Computed ----
  const correctCount = isQuizMode
    ? quizAnswers.filter((a) => a.was_correct).length
    : answers.filter((a) => a.confidence >= 3).length;
  const totalAnswered = isQuizMode ? quizAnswers.length : answers.length;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  // ---- Styles ----
  const selectStyle = {
    padding: '10px 16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    letterSpacing: 0.5,
    cursor: 'pointer',
    minWidth: 180,
    outline: 'none',
  };

  const chipStyle = (isActive) => ({
    padding: '8px 16px',
    background: isActive ? 'rgba(72, 202, 228, 0.15)' : 'var(--surface)',
    border: `1px solid ${isActive ? 'rgba(72, 202, 228, 0.3)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    color: isActive ? 'var(--info)' : 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: isActive ? 700 : 400,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'var(--transition)',
  });

  // ---- Render ----
  const inSession = sessionId !== null && questions.length > 0 && !sessionComplete;

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-xl)',
      }}>
        <h1 className="section-header" style={{ margin: 0 }}>Study</h1>
        <button
          onClick={() => setShowShortcutHelp(true)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 0.5,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
        >
          ? Shortcuts
        </button>
      </div>

      {/* Mode tabs */}
      <div className="pill-tabs" style={{ marginBottom: 'var(--space-lg)', maxWidth: 500 }}>
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            className={`pill-tab ${mode === key ? 'pill-tab--active' : ''}`}
            onClick={() => {
              setMode(key);
              if (inSession) resetSession();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Forge mode */}
      {isForgeMode && !inSession && (
        <QuestionForge />
      )}

      {/* Filters (pre-session) */}
      {!isForgeMode && !inSession && !sessionComplete && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-2xl)',
        }}>
          {/* Standard filters for flashcard and quiz modes */}
          {!isRevengeMode && !isDeepDiveMode && (
            <>
              {/* Row 1: category + difficulty */}
              <div style={{
                display: 'flex',
                gap: 'var(--space-md)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <div>
                  <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
                    Category
                  </div>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
                    Difficulty
                  </div>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={selectStyle}>
                    {DIFFICULTIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>

              {/* Subcategory dropdown */}
              {category !== 'All Categories' && availableSubcategories.length > 0 && (
                <div>
                  <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
                    Subcategory
                  </div>
                  <select
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    style={selectStyle}
                    disabled={subcategoriesLoading}
                  >
                    <option value="">All Subcategories ({availableSubcategories.reduce((s, sc) => s + sc.count, 0)})</option>
                    {availableSubcategories.map((sc) => (
                      <option key={sc.subcategory} value={sc.subcategory}>
                        {sc.subcategory} ({sc.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Row 2: Quiz-specific config */}
              {isQuizMode && (
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-xl)',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                      Questions
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      {QUIZ_COUNTS.map((count) => (
                        <button
                          key={count}
                          onClick={() => setQuizCount(count)}
                          style={chipStyle(quizCount === count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                      Timer per Question
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      {QUIZ_TIMERS.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setQuizTimerSec(value)}
                          style={chipStyle(quizTimerSec === value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== REVENGE MATCH pre-session ===== */}
          {isRevengeMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {/* Header */}
              <div style={{
                padding: 'var(--space-lg) var(--space-xl)',
                background: 'rgba(255, 107, 107, 0.06)',
                border: '1px solid rgba(255, 107, 107, 0.2)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--danger)',
                  marginBottom: 'var(--space-xs)',
                }}>Revenge Match</div>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  color: 'var(--text)',
                  lineHeight: 1.5,
                }}>
                  Face your worst categories. Conquer the questions that defeated you before.
                </div>
              </div>

              {/* Nemesis Board */}
              <div>
                <div className="mono-label" style={{ color: 'var(--danger)', marginBottom: 'var(--space-sm)', letterSpacing: 1.5 }}>
                  Nemesis Board
                </div>
                {categoryStatsLoading ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    Scanning for weaknesses...
                  </div>
                ) : revengeNemeses.length === 0 ? (
                  <div style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}>
                    No nemeses found. Study some questions first to build your nemesis board.
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 'var(--space-sm)',
                  }}>
                    {revengeNemeses.map((stat, idx) => {
                      const colors = getCategoryColor(stat.category);
                      return (
                        <div key={stat.category} style={{
                          padding: 'var(--space-md)',
                          background: `rgba(255, 107, 107, ${0.08 - idx * 0.01})`,
                          border: '1px solid rgba(255, 107, 107, 0.25)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'var(--transition)',
                          outline: revengeFocus === stat.category ? '2px solid var(--danger)' : 'none',
                          outlineOffset: 2,
                        }}
                        onClick={() => setRevengeFocus(
                          revengeFocus === stat.category ? 'all' : stat.category
                        )}
                        >
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--space-xs)',
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              color: colors.accent,
                            }}>{stat.category}</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: 'var(--danger)',
                              fontWeight: 700,
                            }}>#{idx + 1}</span>
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 22,
                            fontWeight: 700,
                            color: 'var(--danger)',
                          }}>{stat.accuracy_pct ?? 0}%</div>
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                          }}>accuracy ({stat.studied}/{stat.total} studied)</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Focus selector */}
              <div>
                <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                  Focus
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setRevengeFocus('all')}
                    style={{
                      ...chipStyle(revengeFocus === 'all'),
                      borderColor: revengeFocus === 'all' ? 'rgba(255, 107, 107, 0.4)' : 'var(--border)',
                      color: revengeFocus === 'all' ? 'var(--danger)' : 'var(--text-muted)',
                      background: revengeFocus === 'all' ? 'rgba(255, 107, 107, 0.12)' : 'var(--surface)',
                    }}
                  >
                    All Missed
                  </button>
                  {revengeNemeses.map((stat) => (
                    <button
                      key={stat.category}
                      onClick={() => setRevengeFocus(stat.category)}
                      style={{
                        ...chipStyle(revengeFocus === stat.category),
                        borderColor: revengeFocus === stat.category ? 'rgba(255, 107, 107, 0.4)' : 'var(--border)',
                        color: revengeFocus === stat.category ? 'var(--danger)' : 'var(--text-muted)',
                        background: revengeFocus === stat.category ? 'rgba(255, 107, 107, 0.12)' : 'var(--surface)',
                      }}
                    >
                      {stat.category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== DEEP DIVE pre-session ===== */}
          {isDeepDiveMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {/* Header */}
              <div style={{
                padding: 'var(--space-lg) var(--space-xl)',
                background: 'rgba(72, 202, 228, 0.06)',
                border: '1px solid rgba(72, 202, 228, 0.2)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--info)',
                  marginBottom: 'var(--space-xs)',
                }}>Category Deep Dive</div>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  color: 'var(--text)',
                  lineHeight: 1.5,
                }}>
                  Pick a category and master it from easiest to hardest.
                </div>
              </div>

              {/* Category selector grid */}
              <div>
                <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', letterSpacing: 1.5 }}>
                  Select a Category
                </div>
                {categoryStatsLoading ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    Loading categories...
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 'var(--space-sm)',
                  }}>
                    {Object.keys(CATEGORY_COLORS).map((cat) => {
                      const colors = getCategoryColor(cat);
                      const stat = categoryStats.find((s) => s.category === cat);
                      const studied = stat?.studied ?? 0;
                      const total = stat?.total ?? 0;
                      const mastery = stat?.mastery_pct ?? 0;
                      const isSelected = deepDiveCategory === cat;
                      return (
                        <div
                          key={cat}
                          onClick={() => setDeepDiveCategory(isSelected ? null : cat)}
                          style={{
                            padding: 'var(--space-md)',
                            background: isSelected
                              ? `rgba(${hexToRgb(colors.primary)}, 0.15)`
                              : 'var(--surface)',
                            border: `1px solid ${isSelected ? colors.accent : 'var(--border)'}`,
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            outline: isSelected ? `2px solid ${colors.accent}` : 'none',
                            outlineOffset: 2,
                          }}
                        >
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            color: colors.accent,
                            marginBottom: 'var(--space-xs)',
                          }}>{cat}</div>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: 'var(--text-muted)',
                            }}>{studied}/{total}</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              fontWeight: 700,
                              color: mastery >= 70 ? 'var(--success)' : mastery >= 40 ? 'var(--warning)' : 'var(--text-muted)',
                            }}>{mastery}%</span>
                          </div>
                          {/* Mini mastery bar */}
                          <div style={{
                            marginTop: 'var(--space-xs)',
                            height: 3,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${mastery}%`,
                              background: colors.accent,
                              borderRadius: 2,
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subcategory chips for Deep Dive narrowing */}
              {deepDiveCategory && availableSubcategories.length > 0 && (
                <div>
                  <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', letterSpacing: 1.5 }}>
                    Narrow by Subcategory (optional)
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSubcategory('')}
                      style={{
                        ...chipStyle(!subcategory),
                        borderColor: !subcategory ? `${getCategoryColor(deepDiveCategory).accent}44` : 'var(--border)',
                        color: !subcategory ? getCategoryColor(deepDiveCategory).accent : 'var(--text-muted)',
                        background: !subcategory ? `rgba(${hexToRgb(getCategoryColor(deepDiveCategory).primary)}, 0.12)` : 'var(--surface)',
                      }}
                    >
                      All
                    </button>
                    {availableSubcategories.map((sc) => (
                      <button
                        key={sc.subcategory}
                        onClick={() => setSubcategory(subcategory === sc.subcategory ? '' : sc.subcategory)}
                        style={{
                          ...chipStyle(subcategory === sc.subcategory),
                          borderColor: subcategory === sc.subcategory ? `${getCategoryColor(deepDiveCategory).accent}44` : 'var(--border)',
                          color: subcategory === sc.subcategory ? getCategoryColor(deepDiveCategory).accent : 'var(--text-muted)',
                          background: subcategory === sc.subcategory ? `rgba(${hexToRgb(getCategoryColor(deepDiveCategory).primary)}, 0.12)` : 'var(--surface)',
                        }}
                      >
                        {sc.subcategory} ({sc.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Start button */}
          <div>
            <button
              className={`btn ${isRevengeMode ? 'btn--danger' : 'btn--primary'}`}
              onClick={startSession}
              disabled={loading || (isDeepDiveMode && !deepDiveCategory)}
              style={{ opacity: (loading || (isDeepDiveMode && !deepDiveCategory)) ? 0.6 : 1 }}
            >
              {loading
                ? 'Loading...'
                : isQuizMode
                  ? `Start Quiz (${quizCount} questions)`
                  : isRevengeMode
                    ? 'Begin Revenge Match'
                    : isDeepDiveMode
                      ? deepDiveCategory
                        ? `Deep Dive: ${deepDiveCategory}`
                        : 'Select a Category'
                      : 'Start Session'}
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: 'var(--space-md) var(--space-lg)',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--danger)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          marginBottom: 'var(--space-lg)',
        }}>
          {error}
        </div>
      )}

      {/* Active session */}
      {inSession && currentQuestion && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-lg)',
        }}>
          {/* Revenge Match in-session header */}
          {isRevengeMode && (
            <div style={{
              width: '100%',
              maxWidth: 640,
              textAlign: 'center',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'rgba(255, 107, 107, 0.08)',
              border: '1px solid rgba(255, 107, 107, 0.2)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: 'var(--danger)',
              }}>Revenge Match</div>
              {revengeFocus !== 'all' && (
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  letterSpacing: 0.5,
                }}>Targeting: {revengeFocus}</div>
              )}
            </div>
          )}

          {/* Deep Dive in-session category banner */}
          {isDeepDiveMode && deepDiveCategory && (
            <div style={{
              width: '100%',
              maxWidth: 640,
              textAlign: 'center',
              padding: 'var(--space-sm) var(--space-md)',
              background: `rgba(${hexToRgb(getCategoryColor(deepDiveCategory).primary)}, 0.12)`,
              border: `1px solid ${getCategoryColor(deepDiveCategory).accent}44`,
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: getCategoryColor(deepDiveCategory).accent,
              }}>{deepDiveCategory}</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 2,
                letterSpacing: 1,
              }}>Category Deep Dive</div>
            </div>
          )}

          {/* Deep Dive category completion bar */}
          {isDeepDiveMode && deepDiveCategory && (
            <div style={{ width: '100%', maxWidth: 640 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  letterSpacing: 0.5,
                }}>Category Completion</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: getCategoryColor(deepDiveCategory).accent,
                  fontWeight: 700,
                }}>{currentIndex + 1} / {questions.length}</span>
              </div>
              <div style={{
                height: 8,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${((currentIndex + 1) / questions.length) * 100}%`,
                  background: `linear-gradient(90deg, ${getCategoryColor(deepDiveCategory).primary}, ${getCategoryColor(deepDiveCategory).accent})`,
                  borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Progress bar */}
          <ProgressBar
            current={currentIndex + 1}
            total={questions.length}
            streak={streak}
          />

          {/* Quiz timer */}
          {isQuizMode && quizTimerSec > 0 && !isFlipped && (
            <QuizTimer
              key={timerKey}
              seconds={quizTimerSec}
              onTimeUp={handleTimeUp}
              isPaused={isFlipped}
            />
          )}

          {/* Timer expired notice */}
          {isQuizMode && timerExpired && isFlipped && (
            <div style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--danger)',
              letterSpacing: 0.5,
            }}>
              Time's up!
            </div>
          )}

          {/* Flashcard */}
          <Flashcard
            question={currentQuestion}
            isFlipped={isFlipped}
            onFlip={flipCard}
            bookmarked={currentDetail?.bookmarked || false}
            onToggleBookmark={handleToggleBookmark}
            notes={currentDetail?.notes || null}
            tags={currentDetail?.tags || []}
            progress={currentDetail?.progress || null}
          />

          {/* Flashcard mode: Rating buttons */}
          {!isQuizMode && isFlipped && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-md)',
              width: '100%',
              animation: 'fadeIn 0.3s ease',
            }}>
              <RatingButtons onRate={handleRate} disabled={false} />

              <button
                onClick={skipQuestion}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 'var(--space-xs) var(--space-md)',
                  transition: 'var(--transition)',
                }}
              >
                Skip (S)
              </button>
            </div>
          )}

          {/* Quiz mode: Correct / Incorrect buttons */}
          {isQuizMode && isFlipped && (
            <div style={{
              display: 'flex',
              gap: 'var(--space-md)',
              width: '100%',
              maxWidth: 640,
              animation: 'fadeIn 0.3s ease',
            }}>
              <button
                onClick={() => handleQuizAnswer(true)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: 'var(--space-lg) var(--space-md)',
                  background: 'rgba(82, 183, 136, 0.15)',
                  border: '1px solid rgba(82, 183, 136, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <span style={{
                  position: 'absolute', top: 6, right: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--success)', opacity: 0.6,
                  background: 'rgba(0,0,0,0.3)', width: 16, height: 16,
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>Y</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700,
                  letterSpacing: 1, color: 'var(--success)', textTransform: 'uppercase',
                }}>Got It</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--success)', opacity: 0.7,
                }}>I knew this</span>
              </button>

              <button
                onClick={() => handleQuizAnswer(false)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: 'var(--space-lg) var(--space-md)',
                  background: 'rgba(255, 107, 107, 0.15)',
                  border: '1px solid rgba(255, 107, 107, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <span style={{
                  position: 'absolute', top: 6, right: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--danger)', opacity: 0.6,
                  background: 'rgba(0,0,0,0.3)', width: 16, height: 16,
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>X</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700,
                  letterSpacing: 1, color: 'var(--danger)', textTransform: 'uppercase',
                }}>Missed It</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--danger)', opacity: 0.7,
                }}>Didn't know</span>
              </button>
            </div>
          )}

          {/* Note editor (toggled by N key) */}
          {isFlipped && (noteExpanded || currentDetail?.notes) && (
            <NoteEditor
              questionId={currentQuestion.id}
              initialNote={currentDetail?.notes || null}
              onSaved={handleNoteSaved}
            />
          )}

          {/* Tag manager */}
          {isFlipped && (
            <TagManager
              questionId={currentQuestion.id}
              tags={currentDetail?.tags || []}
              onTagsChanged={handleTagsChanged}
            />
          )}

          {/* Note toggle */}
          {isFlipped && !noteExpanded && !currentDetail?.notes && (
            <button
              onClick={() => setNoteExpanded(true)}
              style={{
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-xs) var(--space-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 0.5,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              + Add Note (N)
            </button>
          )}
        </div>
      )}

      {/* Placeholder when no session */}
      {!isForgeMode && !inSession && !sessionComplete && !error && questions.length === 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 640,
            minHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            padding: 'var(--space-2xl)',
          }}>
            <div className="mono-label" style={{
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-md)',
              textTransform: 'uppercase',
            }}>
              {MODES.find((m) => m.key === mode)?.label || 'Flashcard'} Mode
            </div>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              lineHeight: 1.5,
              color: 'var(--text)',
              maxWidth: 480,
            }}>
              {isQuizMode
                ? 'Configure your quiz and click Start'
                : isRevengeMode
                  ? 'Review your nemesis board and begin your revenge'
                  : isDeepDiveMode
                    ? 'Select a category above to begin your deep dive'
                    : 'Select your filters and click Start Session'}
            </div>
            <div style={{
              marginTop: 'var(--space-xl)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: 1,
            }}>
              Press ? for keyboard shortcuts
            </div>
          </div>
        </div>
      )}

      {/* Session complete */}
      {sessionComplete && isQuizMode && (
        <QuizResults
          answers={quizAnswers}
          questions={questions}
          onNewSession={startSession}
          onChangeFilters={resetSession}
        />
      )}

      {/* Generic flashcard session complete (not quiz, not revenge, not deep dive) */}
      {sessionComplete && !isQuizMode && !isRevengeMode && !isDeepDiveMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 480,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: 'var(--space-2xl)',
            gap: 'var(--space-lg)',
          }}>
            <div className="section-header" style={{ margin: 0 }}>Session Complete</div>

            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 700,
              color: accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--danger)',
              lineHeight: 1.2,
            }}>
              {accuracy}%
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-xl)', justifyContent: 'center' }}>
              {[
                { value: totalAnswered, label: 'Total', color: 'var(--text)' },
                { value: correctCount, label: 'Correct', color: 'var(--success)' },
                { value: totalAnswered - correctCount, label: 'Missed', color: 'var(--danger)' },
              ].map(({ value, label, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color,
                  }}>{value}</div>
                  <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
              <button className="btn btn--primary" onClick={startSession}>Start New Session</button>
              <button className="btn" onClick={resetSession}>Change Filters</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== REVENGE MATCH session complete ===== */}
      {sessionComplete && isRevengeMode && (() => {
        // Build per-category breakdown from answers + questions
        const catBreakdown = {};
        answers.forEach((a) => {
          const q = questions.find((qu) => qu.id === a.question_id);
          if (!q) return;
          const cat = q.category || 'Unknown';
          if (!catBreakdown[cat]) catBreakdown[cat] = { correct: 0, total: 0 };
          catBreakdown[cat].total++;
          if (a.confidence >= 3) catBreakdown[cat].correct++;
        });

        const defeated = Object.entries(catBreakdown).filter(([, v]) => v.correct > v.total / 2);
        const standing = Object.entries(catBreakdown).filter(([, v]) => v.correct <= v.total / 2);

        const motivational = accuracy >= 80
          ? 'Dominant performance. Your nemeses are running scared.'
          : accuracy >= 60
            ? 'Solid revenge. You are making progress against your weaknesses.'
            : accuracy >= 40
              ? 'The fight continues. Keep grinding and these nemeses will fall.'
              : 'Tough round. But every attempt makes you stronger for the next battle.';

        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 400,
          }}>
            <div className="card" style={{
              width: '100%',
              maxWidth: 560,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: 'var(--space-2xl)',
              gap: 'var(--space-lg)',
              borderColor: 'rgba(255, 107, 107, 0.2)',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: 'var(--danger)',
              }}>Nemesis Report</div>

              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 32,
                fontWeight: 700,
                color: accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--danger)',
                lineHeight: 1.2,
              }}>
                {accuracy}%
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-xl)', justifyContent: 'center' }}>
                {[
                  { value: totalAnswered, label: 'Battles', color: 'var(--text)' },
                  { value: correctCount, label: 'Victories', color: 'var(--success)' },
                  { value: totalAnswered - correctCount, label: 'Defeats', color: 'var(--danger)' },
                ].map(({ value, label, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color,
                    }}>{value}</div>
                    <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Defeated nemeses */}
              {defeated.length > 0 && (
                <div style={{ width: '100%', textAlign: 'left' }}>
                  <div className="mono-label" style={{
                    color: 'var(--success)',
                    marginBottom: 'var(--space-xs)',
                    letterSpacing: 1,
                  }}>Nemeses Defeated</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    {defeated.map(([cat, v]) => {
                      const colors = getCategoryColor(cat);
                      return (
                        <div key={cat} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 'var(--space-xs) var(--space-md)',
                          background: 'rgba(82, 183, 136, 0.08)',
                          border: '1px solid rgba(82, 183, 136, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: colors.accent,
                            fontWeight: 700,
                          }}>{cat}</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--success)',
                          }}>{v.correct}/{v.total} correct</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Still standing nemeses */}
              {standing.length > 0 && (
                <div style={{ width: '100%', textAlign: 'left' }}>
                  <div className="mono-label" style={{
                    color: 'var(--danger)',
                    marginBottom: 'var(--space-xs)',
                    letterSpacing: 1,
                  }}>Still Standing</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    {standing.map(([cat, v]) => {
                      const colors = getCategoryColor(cat);
                      return (
                        <div key={cat} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 'var(--space-xs) var(--space-md)',
                          background: 'rgba(255, 107, 107, 0.08)',
                          border: '1px solid rgba(255, 107, 107, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: colors.accent,
                            fontWeight: 700,
                          }}>{cat}</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--danger)',
                          }}>{v.correct}/{v.total} correct</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Motivational message */}
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                padding: 'var(--space-sm) var(--space-md)',
                borderTop: '1px solid var(--border)',
                width: '100%',
                marginTop: 'var(--space-xs)',
              }}>
                {motivational}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                <button className="btn btn--danger" onClick={startSession}>Rematch</button>
                <button className="btn" onClick={resetSession}>Change Focus</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== DEEP DIVE session complete ===== */}
      {sessionComplete && isDeepDiveMode && (() => {
        const colors = getCategoryColor(deepDiveCategory);
        const catStat = categoryStats.find((s) => s.category === deepDiveCategory);
        const overallMastery = catStat?.mastery_pct ?? 0;
        const overallAccuracy = catStat?.accuracy_pct ?? 0;

        const comparison = accuracy > overallAccuracy
          ? `You scored above your average (${overallAccuracy}%) for this category.`
          : accuracy === overallAccuracy
            ? `Right at your average (${overallAccuracy}%) for this category.`
            : `Below your average (${overallAccuracy}%) for this category. Keep practicing.`;

        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 400,
          }}>
            <div className="card" style={{
              width: '100%',
              maxWidth: 520,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: 'var(--space-2xl)',
              gap: 'var(--space-lg)',
              borderColor: `${colors.accent}44`,
            }}>
              {/* Category badge */}
              <div style={{
                padding: 'var(--space-xs) var(--space-lg)',
                background: `rgba(${hexToRgb(colors.primary)}, 0.15)`,
                border: `1px solid ${colors.accent}44`,
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: colors.accent,
                }}>{deepDiveCategory}</span>
              </div>

              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>Category Mastery Summary</div>

              {/* Session accuracy */}
              <div>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 32,
                  fontWeight: 700,
                  color: accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--danger)',
                  lineHeight: 1.2,
                }}>
                  {accuracy}%
                </div>
                <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>Session Accuracy</div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-xl)', justifyContent: 'center' }}>
                {[
                  { value: totalAnswered, label: 'Studied', color: 'var(--text)' },
                  { value: correctCount, label: 'Correct', color: 'var(--success)' },
                  { value: totalAnswered - correctCount, label: 'Missed', color: 'var(--danger)' },
                ].map(({ value, label, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color,
                    }}>{value}</div>
                    <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Overall mastery */}
              <div style={{
                width: '100%',
                padding: 'var(--space-md)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-xs)',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    letterSpacing: 0.5,
                  }}>Overall Category Mastery</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: colors.accent,
                  }}>{overallMastery}%</span>
                </div>
                <div style={{
                  height: 6,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${overallMastery}%`,
                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Comparison text */}
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                {comparison}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    // Continue with same category — reset session state but keep deepDiveCategory
                    setSessionId(null);
                    setQuestions([]);
                    setCurrentIndex(0);
                    setIsFlipped(false);
                    setStreak(0);
                    setAnswers([]);
                    setQuizAnswers([]);
                    setSessionComplete(false);
                    setQuestionDetails({});
                    setError(null);
                    setNoteExpanded(false);
                    setTimerExpired(false);
                    // Re-fetch stats and immediately start
                    getStatsCategories()
                      .then((data) => {
                        const stats = Array.isArray(data) ? data : data.categories || [];
                        setCategoryStats(stats);
                      })
                      .catch(() => {});
                    // Slight delay to let state settle, then start
                    setTimeout(() => startSession(), 50);
                  }}
                  style={{
                    borderColor: `${colors.accent}44`,
                  }}
                >
                  Continue {deepDiveCategory}
                </button>
                <button className="btn" onClick={resetSession}>Pick Category</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Keyboard shortcut modal */}
      <KeyboardShortcutHelp
        isOpen={showShortcutHelp}
        onClose={() => setShowShortcutHelp(false)}
      />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
