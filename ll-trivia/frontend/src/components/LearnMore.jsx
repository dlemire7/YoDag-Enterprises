import { useState, useEffect, useCallback, useRef } from 'react';
import { learnMore } from '../api/client';

const MODES = [
  { key: 'quick', label: 'Quick Explain' },
  { key: 'deep_dive', label: 'Deep Dive' },
  { key: 'quiz_bowl', label: 'Quiz Bowl' },
];

function SkeletonLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 'var(--space-md)' }}>
      {[100, 85, 92, 60].map((width, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${width}%`,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-sm)',
            animation: 'learnMorePulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function renderQuizBowl(text) {
  // Split into Q/A pairs. Each pair starts with "Q:" and has a corresponding "A:"
  const lines = text.split('\n');
  const pairs = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Q:')) {
      if (current) pairs.push(current);
      current = { question: trimmed.slice(2).trim(), answer: '' };
    } else if (trimmed.startsWith('A:') && current) {
      current.answer = trimmed.slice(2).trim();
    } else if (current && trimmed) {
      // Continuation line
      if (current.answer) {
        current.answer += ' ' + trimmed;
      } else {
        current.question += ' ' + trimmed;
      }
    }
  }
  if (current) pairs.push(current);

  if (pairs.length === 0) {
    // Fallback: render as plain text if no Q/A pattern found
    return renderPlainText(text);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {pairs.map((pair, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-sm) var(--space-md)',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--info)',
            marginBottom: 4,
          }}>
            Q{i + 1}
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text)',
            marginBottom: 'var(--space-sm)',
          }}>
            {pair.question}
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--success)',
            paddingLeft: 'var(--space-sm)',
            borderLeft: '2px solid var(--success)',
          }}>
            {pair.answer}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderPlainText(text) {
  const paragraphs = text.split('\n').filter((line) => line.trim() !== '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text)',
          }}
        >
          {para}
        </p>
      ))}
    </div>
  );
}

export default function LearnMore({ questionId, isVisible }) {
  const [expanded, setExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Cache: { "questionId:mode": responseText }
  const cacheRef = useRef({});

  // Track the current questionId so we can collapse when it changes
  const prevQuestionIdRef = useRef(questionId);
  useEffect(() => {
    if (prevQuestionIdRef.current !== questionId) {
      setExpanded(false);
      setActiveMode(null);
      setError(null);
      prevQuestionIdRef.current = questionId;
    }
  }, [questionId]);

  // Keyboard shortcut: "L" toggles the panel
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setExpanded((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const fetchContent = useCallback(async (mode) => {
    const cacheKey = `${questionId}:${mode}`;
    if (cacheRef.current[cacheKey]) {
      return; // Already cached
    }

    setLoading(true);
    setError(null);
    try {
      const result = await learnMore(questionId, mode);
      cacheRef.current[cacheKey] = result.response_text;
    } catch (err) {
      console.error('Failed to fetch learn more content:', err);
      setError(err.message || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  const handleTabClick = useCallback((mode) => {
    setActiveMode(mode);
    fetchContent(mode);
  }, [fetchContent]);

  if (!isVisible) return null;

  const currentCacheKey = activeMode ? `${questionId}:${activeMode}` : null;
  const cachedContent = currentCacheKey ? cacheRef.current[currentCacheKey] : null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
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
          width: '100%',
          textAlign: 'center',
          marginTop: 'var(--space-sm)',
        }}
      >
        Learn More (L)
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 'var(--space-sm)',
      animation: 'learnMoreFadeIn 0.25s ease',
    }}>
      {/* Mode tabs */}
      <div
        className="pill-tabs"
        style={{
          marginBottom: 'var(--space-md)',
          justifyContent: 'center',
        }}
      >
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            className={`pill-tab ${activeMode === key ? 'pill-tab--active' : ''}`}
            onClick={() => handleTabClick(key)}
            style={{ fontSize: 11, padding: '5px 12px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content area */}
      {activeMode && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-md)',
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {loading && !cachedContent && <SkeletonLoader />}

          {error && !cachedContent && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--danger)',
              textAlign: 'center',
              padding: 'var(--space-md)',
            }}>
              {error}
            </div>
          )}

          {cachedContent && (
            activeMode === 'quiz_bowl'
              ? renderQuizBowl(cachedContent)
              : renderPlainText(cachedContent)
          )}

          {!loading && !error && !cachedContent && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: 'var(--space-md)',
              letterSpacing: 0.5,
            }}>
              Select a mode above to learn more
            </div>
          )}
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={() => setExpanded(false)}
        style={{
          display: 'block',
          margin: 'var(--space-sm) auto 0',
          background: 'none',
          border: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 0.5,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '2px 8px',
          transition: 'var(--transition)',
        }}
      >
        Collapse (L)
      </button>

      <style>{`
        @keyframes learnMorePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes learnMoreFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
