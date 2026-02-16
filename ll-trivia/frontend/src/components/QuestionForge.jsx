import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_COLORS, getCategoryColor } from '../styles/categories';
import { generateQuestions, getStatsCategories } from '../api/client';

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed' },
];

const COUNTS = [3, 5, 10];

const CATEGORIES = Object.keys(CATEGORY_COLORS);

// Convert hex color to r,g,b string for rgba() usage
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '128,128,128';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

function getDifficultyBadge(percentCorrect) {
  if (percentCorrect == null) return { label: 'Unknown', color: 'var(--text-muted)' };
  if (percentCorrect >= 60) return { label: 'Easy', color: 'var(--success)' };
  if (percentCorrect >= 30) return { label: 'Medium', color: 'var(--warning)' };
  return { label: 'Hard', color: 'var(--danger)' };
}

export default function QuestionForge({ onStudyGenerated }) {
  const navigate = useNavigate();

  // Config state
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [difficulty, setDifficulty] = useState('mixed');
  const [count, setCount] = useState(5);

  // Data state
  const [weakCategories, setWeakCategories] = useState([]);
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Generation state
  const [phase, setPhase] = useState('config'); // 'config' | 'loading' | 'results'
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [error, setError] = useState(null);

  // Loading animation state
  const [dotCount, setDotCount] = useState(0);

  // Fetch weak categories on mount
  useEffect(() => {
    let cancelled = false;
    getStatsCategories()
      .then((data) => {
        if (cancelled) return;
        const stats = Array.isArray(data) ? data : data.categories || [];
        const sorted = [...stats]
          .filter((s) => s.studied > 0)
          .sort((a, b) => (a.accuracy_pct ?? 100) - (b.accuracy_pct ?? 100));
        setWeakCategories(sorted.slice(0, 5).map((s) => s.category));
        setStatsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setStatsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Animated dots during loading
  useEffect(() => {
    if (phase !== 'loading') return;
    const interval = setInterval(() => {
      setDotCount((d) => (d + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, [phase]);

  const handleGenerate = async () => {
    if (!selectedCategory) return;
    setError(null);
    setPhase('loading');
    setDotCount(0);
    try {
      const data = await generateQuestions(selectedCategory, count, difficulty);
      setGeneratedQuestions(data.questions || []);
      setRevealedAnswers({});
      setPhase('results');
    } catch (err) {
      setError(err.message || 'Failed to generate questions. Please try again.');
      setPhase('config');
    }
  };

  const toggleReveal = (id) => {
    setRevealedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStudyGenerated = () => {
    if (onStudyGenerated) {
      onStudyGenerated(generatedQuestions);
    }
    navigate('/study?mode=flashcard');
  };

  const handleGenerateMore = () => {
    setPhase('config');
    setGeneratedQuestions([]);
    setRevealedAnswers({});
    setError(null);
  };

  // ---- Styles ----

  const pillStyle = (isActive, color = 'var(--info)') => ({
    padding: '8px 18px',
    background: isActive ? `rgba(${color === 'var(--info)' ? '72,202,228' : '255,186,8'}, 0.15)` : 'var(--surface)',
    border: `1px solid ${isActive ? `rgba(${color === 'var(--info)' ? '72,202,228' : '255,186,8'}, 0.3)` : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    color: isActive ? color : 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: isActive ? 700 : 400,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  });

  // ---- Config Phase ----
  if (phase === 'config') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
        {/* Header */}
        <div style={{
          padding: 'var(--space-lg) var(--space-xl)',
          background: 'rgba(255, 186, 8, 0.06)',
          border: '1px solid rgba(255, 186, 8, 0.2)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--warning)',
            marginBottom: 'var(--space-xs)',
          }}>Question Forge</div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16,
            color: 'var(--text)',
            lineHeight: 1.5,
          }}>
            Generate AI-powered practice questions for any category. Questions are saved automatically.
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: 'var(--space-md) var(--space-lg)',
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Category Grid */}
        <div>
          <div className="mono-label" style={{
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-sm)',
            letterSpacing: 1.5,
          }}>
            Select a Category
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
            gap: 'var(--space-sm)',
          }}>
            {CATEGORIES.map((cat) => {
              const colors = getCategoryColor(cat);
              const isSelected = selectedCategory === cat;
              const isWeak = weakCategories.includes(cat);
              return (
                <div
                  key={cat}
                  onClick={() => setSelectedCategory(isSelected ? null : cat)}
                  style={{
                    padding: 'var(--space-md)',
                    background: isSelected
                      ? `rgba(${hexToRgb(colors.primary)}, 0.18)`
                      : 'var(--surface)',
                    border: `1px solid ${isSelected ? colors.accent : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: isSelected ? `2px solid ${colors.accent}` : 'none',
                    outlineOffset: 2,
                    position: 'relative',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: colors.accent,
                  }}>
                    {cat}
                  </div>
                  {/* Weak badge */}
                  {isWeak && statsLoaded && (
                    <span style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      background: 'rgba(255, 107, 107, 0.15)',
                      color: 'var(--danger)',
                      padding: '2px 5px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255, 107, 107, 0.25)',
                      fontWeight: 700,
                    }}>
                      weak
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Difficulty Selector */}
        <div>
          <div className="mono-label" style={{
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-sm)',
            letterSpacing: 1.5,
          }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {DIFFICULTIES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setDifficulty(value)}
                style={pillStyle(difficulty === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Count Selector */}
        <div>
          <div className="mono-label" style={{
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-sm)',
            letterSpacing: 1.5,
          }}>
            Number of Questions
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                style={pillStyle(count === c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <div>
          <button
            className="btn btn--primary"
            onClick={handleGenerate}
            disabled={!selectedCategory}
            style={{
              opacity: !selectedCategory ? 0.5 : 1,
              background: selectedCategory
                ? `linear-gradient(135deg, var(--warning), ${getCategoryColor(selectedCategory).accent})`
                : undefined,
              border: selectedCategory ? '1px solid rgba(255, 186, 8, 0.4)' : undefined,
              color: selectedCategory ? 'var(--bg)' : undefined,
              fontWeight: 700,
            }}
          >
            {selectedCategory ? `Generate ${count} Questions` : 'Select a Category First'}
          </button>
        </div>

        <style>{`
          @keyframes forgePulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ---- Loading Phase ----
  if (phase === 'loading') {
    const colors = selectedCategory ? getCategoryColor(selectedCategory) : { primary: '#FFBA08', accent: '#FFBA08' };
    const dots = '.'.repeat(dotCount);

    return (
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
          borderColor: `${colors.accent}44`,
        }}>
          {/* Animated spinner */}
          <div style={{
            width: 56,
            height: 56,
            border: `3px solid rgba(${hexToRgb(colors.primary)}, 0.15)`,
            borderTop: `3px solid ${colors.accent}`,
            borderRadius: '50%',
            animation: 'forgeSpin 1s linear infinite',
          }} />

          {/* Category name */}
          <div style={{
            padding: 'var(--space-xs) var(--space-lg)',
            background: `rgba(${hexToRgb(colors.primary)}, 0.12)`,
            border: `1px solid ${colors.accent}44`,
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: colors.accent,
            }}>{selectedCategory}</span>
          </div>

          {/* Pulsing message */}
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            color: 'var(--warning)',
            animation: 'forgePulse 1.5s ease-in-out infinite',
            lineHeight: 1.4,
          }}>
            Forging questions{dots}
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: 0.5,
          }}>
            Generating {count} {difficulty} questions
          </div>

          {/* Subtle progress hint */}
          <div style={{
            width: '80%',
            height: 3,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 2,
            overflow: 'hidden',
            marginTop: 'var(--space-sm)',
          }}>
            <div style={{
              height: '100%',
              background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
              borderRadius: 2,
              animation: 'forgeProgress 2s ease-in-out infinite',
            }} />
          </div>
        </div>

        <style>{`
          @keyframes forgeSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes forgePulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          @keyframes forgeProgress {
            0% { width: 5%; margin-left: 0; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 5%; margin-left: 95%; }
          }
        `}</style>
      </div>
    );
  }

  // ---- Results Phase ----
  const colors = selectedCategory ? getCategoryColor(selectedCategory) : { primary: '#FFBA08', accent: '#FFBA08' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
      {/* Results Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-md)',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--warning)',
            marginBottom: 'var(--space-xs)',
          }}>Questions Forged</div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-sm)',
          }}>
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text)',
            }}>{generatedQuestions.length}</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: colors.accent,
              letterSpacing: 0.5,
            }}>{selectedCategory}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn btn--primary"
            onClick={handleStudyGenerated}
            style={{
              background: 'linear-gradient(135deg, var(--warning), var(--success))',
              border: '1px solid rgba(255, 186, 8, 0.4)',
              color: 'var(--bg)',
              fontWeight: 700,
            }}
          >
            Study Generated
          </button>
          <button className="btn" onClick={handleGenerateMore}>
            Generate More
          </button>
        </div>
      </div>

      {/* Question Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}>
        {generatedQuestions.map((q, idx) => {
          const diff = getDifficultyBadge(q.percent_correct);
          const isRevealed = revealedAnswers[q.id];

          return (
            <div
              key={q.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                borderLeft: `3px solid ${colors.primary}`,
                position: 'relative',
              }}
            >
              {/* AI Generated gradient border accent on top */}
              <div style={{
                height: 2,
                background: 'linear-gradient(90deg, var(--warning), transparent)',
              }} />

              {/* Card top bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-sm) var(--space-lg)',
                borderBottom: '1px solid var(--border)',
                flexWrap: 'wrap',
              }}>
                {/* Question number */}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  letterSpacing: 0.5,
                }}>#{idx + 1}</span>

                {/* AI Badge */}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  background: 'rgba(255, 186, 8, 0.15)',
                  color: 'var(--warning)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255, 186, 8, 0.25)',
                }}>
                  AI Generated
                </span>

                {/* Difficulty badge */}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 0.5,
                  color: diff.color,
                  background: `${diff.color}18`,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  {diff.label}
                </span>

                {/* Category pill */}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  background: `${colors.primary}22`,
                  color: colors.accent,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  marginLeft: 'auto',
                }}>
                  {q.category}
                </span>
              </div>

              {/* Question text */}
              <div style={{
                padding: 'var(--space-lg)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 17,
                  lineHeight: 1.6,
                  color: 'var(--text)',
                  marginBottom: 'var(--space-md)',
                }}>
                  {q.question_text}
                </div>

                {/* Answer area */}
                {isRevealed ? (
                  <div style={{
                    padding: 'var(--space-md)',
                    background: `rgba(${hexToRgb(colors.primary)}, 0.08)`,
                    border: `1px solid ${colors.accent}33`,
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      marginBottom: 'var(--space-xs)',
                    }}>Answer</div>
                    <div style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 18,
                      fontWeight: 700,
                      color: colors.accent,
                      lineHeight: 1.4,
                    }}>
                      {q.answer}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleReveal(q.id)}
                    style={{
                      width: '100%',
                      padding: 'var(--space-sm) var(--space-md)',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px dashed var(--border)',
                      borderRadius: 'var(--radius-md)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: 0.5,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    Click to reveal answer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-lg) 0',
        borderTop: '1px solid var(--border)',
      }}>
        <button
          className="btn btn--primary"
          onClick={handleStudyGenerated}
          style={{
            background: 'linear-gradient(135deg, var(--warning), var(--success))',
            border: '1px solid rgba(255, 186, 8, 0.4)',
            color: 'var(--bg)',
            fontWeight: 700,
          }}
        >
          Study Generated
        </button>
        <button className="btn" onClick={handleGenerateMore}>
          Generate More
        </button>
      </div>
    </div>
  );
}
