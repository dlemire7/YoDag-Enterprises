import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getStatsOverview, getStatsCategories, getSessions } from '../api/client';
import { CATEGORY_COLORS, getCategoryColor } from '../styles/categories';

export default function Dashboard() {
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [overviewData, categoriesData, sessionsData] = await Promise.all([
          getStatsOverview(),
          getStatsCategories(),
          getSessions({ limit: 5 }),
        ]);
        if (cancelled) return;
        setOverview(overviewData);
        setCategories(categoriesData);
        setSessions(sessionsData);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
          Dashboard
        </h1>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-2xl)',
        }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card" style={{
              height: 100,
              background: 'var(--surface)',
              opacity: 0.5,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
          Dashboard
        </h1>
        <div className="card" style={{
          borderTop: '2px solid var(--danger)',
          textAlign: 'center',
          padding: 'var(--space-2xl)',
        }}>
          <div className="mono-label" style={{ color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>
            Error Loading Dashboard
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-lg)',
          }}>
            {error}
          </div>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    total_questions = 0,
    total_studied = 0,
    total_due = 0,
    accuracy_pct = 0,
    current_streak = 0,
    longest_streak = 0,
    questions_today = 0,
  } = overview || {};

  // Empty state: no questions imported yet
  if (total_questions === 0) {
    return (
      <div>
        <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
          Dashboard
        </h1>
        <div className="card" style={{
          textAlign: 'center',
          padding: 'var(--space-2xl)',
          borderTop: '2px solid var(--info)',
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 'var(--space-md)',
          }}>
            ?
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--text)',
            marginBottom: 'var(--space-sm)',
          }}>
            No Questions Yet
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-lg)',
            maxWidth: 400,
            margin: '0 auto var(--space-lg)',
          }}>
            Import questions from LearnedLeague to get started with your training playbook.
          </div>
          <Link to="/import" className="btn btn--primary">
            Go to Import
          </Link>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Questions', value: total_questions.toLocaleString(), color: 'var(--info)' },
    { label: 'Studied', value: total_studied.toLocaleString(), color: 'var(--success)' },
    { label: 'Due for Review', value: total_due.toLocaleString(), color: 'var(--warning)' },
    { label: 'Accuracy', value: `${Math.round(accuracy_pct)}%`, color: 'var(--cat-literature)' },
  ];

  // Build a lookup for category stats
  const categoryStatsMap = {};
  categories.forEach((cat) => {
    categoryStatsMap[cat.category] = cat;
  });

  // Use all known categories, merging in any from the API response
  const allCategoryNames = Object.keys(CATEGORY_COLORS);

  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Dashboard
      </h1>

      {/* Hero Section */}
      <div className="card" style={{
        marginBottom: 'var(--space-2xl)',
        padding: 'var(--space-xl)',
        borderTop: '2px solid var(--warning)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-lg)',
      }}>
        {/* Current Streak */}
        <div style={{ textAlign: 'center' }}>
          <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
            Current Streak
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 48,
            fontWeight: 700,
            color: 'var(--warning)',
            lineHeight: 1,
          }}>
            {current_streak}
          </div>
          <div className="mono-label" style={{ color: 'var(--warning)', marginTop: 'var(--space-xs)' }}>
            {current_streak === 1 ? 'day' : 'days'}
          </div>
          {longest_streak > 0 && (
            <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
              best: {longest_streak}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{
          width: 1,
          height: 60,
          background: 'var(--border)',
        }} />

        {/* Due Count */}
        <div style={{ textAlign: 'center' }}>
          <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
            Questions Due
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 48,
            fontWeight: 700,
            color: total_due > 0 ? 'var(--info)' : 'var(--text-muted)',
            lineHeight: 1,
          }}>
            {total_due}
          </div>
          <div className="mono-label" style={{
            color: total_due > 0 ? 'var(--info)' : 'var(--text-muted)',
            marginTop: 'var(--space-xs)',
          }}>
            {total_due > 0 ? 'ready to review' : 'all caught up'}
          </div>
        </div>

        {/* Divider */}
        <div style={{
          width: 1,
          height: 60,
          background: 'var(--border)',
        }} />

        {/* Studied Today */}
        <div style={{ textAlign: 'center' }}>
          <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
            Studied Today
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 48,
            fontWeight: 700,
            color: questions_today > 0 ? 'var(--success)' : 'var(--text-muted)',
            lineHeight: 1,
          }}>
            {questions_today}
          </div>
          <div className="mono-label" style={{
            color: questions_today > 0 ? 'var(--success)' : 'var(--text-muted)',
            marginTop: 'var(--space-xs)',
          }}>
            {questions_today === 1 ? 'question' : 'questions'}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="card" style={{ borderTop: `2px solid ${color}` }}>
            <div className="mono-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
              {label}
            </div>
            <div style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: 'var(--font-serif)',
              color,
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 className="section-header">Quick Actions</h2>
      <div style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)',
        flexWrap: 'wrap',
      }}>
        <button
          className="btn btn--primary"
          onClick={() => navigate('/study?mode=review')}
          style={total_due === 0 ? { opacity: 0.5 } : undefined}
        >
          Review Due{total_due > 0 ? ` (${total_due})` : ''}
        </button>
        <button
          className="btn"
          onClick={() => navigate('/study?mode=quiz')}
        >
          Quick Quiz
        </button>
        <button
          className="btn"
          onClick={() => navigate('/study?mode=revenge')}
        >
          Revenge Match
        </button>
      </div>

      {/* Category Mastery */}
      <h2 className="section-header">Category Mastery</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {allCategoryNames.map((cat) => {
          const { primary } = getCategoryColor(cat);
          const stats = categoryStatsMap[cat] || { total: 0, studied: 0, accuracy_pct: 0, mastery_pct: 0 };
          const mastery = Math.round(stats.mastery_pct || 0);

          return (
            <div
              key={cat}
              className="card card--accent"
              onClick={() => navigate(`/study?category=${encodeURIComponent(cat)}`)}
              style={{
                '--accent-color': primary,
                padding: 'var(--space-md)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-sm)',
              }}>
                <span className="mono-label" style={{ color: 'var(--text)', textTransform: 'uppercase' }}>
                  {cat}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  fontWeight: 700,
                  color: primary,
                }}>
                  {mastery}%
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 4,
                background: 'var(--border)',
                borderRadius: 2,
                overflow: 'hidden',
                marginBottom: 'var(--space-xs)',
              }}>
                <div style={{
                  width: `${mastery}%`,
                  height: '100%',
                  background: primary,
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span className="mono-label" style={{ color: 'var(--text-muted)' }}>
                  {stats.studied} / {stats.total}
                </span>
                {stats.accuracy_pct > 0 && (
                  <span className="mono-label" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(stats.accuracy_pct)}% acc
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <>
          <h2 className="section-header">Recent Sessions</h2>
          <div className="card" style={{
            padding: 0,
            overflow: 'hidden',
            marginBottom: 'var(--space-2xl)',
          }}>
            {sessions.map((session, idx) => {
              const date = session.started_at
                ? new Date(session.started_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Unknown';
              const mode = session.mode || 'Study';
              const correct = session.correct_count ?? 0;
              const total = session.question_count ?? 0;

              return (
                <div
                  key={session.id || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-md) var(--space-lg)',
                    borderBottom: idx < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span className="mono-label" style={{ color: 'var(--text-muted)', minWidth: 120 }}>
                      {date}
                    </span>
                    <span className="mono-label" style={{
                      color: 'var(--info)',
                      textTransform: 'uppercase',
                    }}>
                      {mode}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    fontWeight: 700,
                    color: total > 0 && correct / total >= 0.7 ? 'var(--success)' : 'var(--text)',
                  }}>
                    {correct}/{total}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
