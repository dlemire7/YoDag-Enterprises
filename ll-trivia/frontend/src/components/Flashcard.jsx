import { getCategoryColor } from '../styles/categories';
import LearnMore from './LearnMore';

function getDifficulty(percentCorrect) {
  if (percentCorrect == null) return null;
  if (percentCorrect >= 60) return { label: 'Easy', color: 'var(--success)' };
  if (percentCorrect >= 30) return { label: 'Medium', color: 'var(--warning)' };
  return { label: 'Hard', color: 'var(--danger)' };
}

function formatSeasonInfo(q) {
  if (!q.season && !q.match_day && !q.question_number) return null;
  const parts = [];
  if (q.season) parts.push(`LL${q.season}`);
  if (q.match_day) parts.push(`MD${q.match_day}`);
  if (q.question_number) parts.push(`Q${q.question_number}`);
  return parts.join(' ');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Flashcard({
  question,
  isFlipped,
  onFlip,
  bookmarked,
  onToggleBookmark,
  notes,
  tags,
  progress,
}) {
  const { primary, accent } = getCategoryColor(question.category);
  const difficulty = getDifficulty(question.percent_correct);
  const seasonInfo = formatSeasonInfo(question);

  const wrapperStyle = {
    perspective: '1000px',
    width: '100%',
    maxWidth: 640,
    minHeight: 360,
  };

  const innerStyle = {
    position: 'relative',
    width: '100%',
    minHeight: 360,
    transition: 'transform 0.6s ease',
    transformStyle: 'preserve-3d',
    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
  };

  const faceBaseStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    minHeight: 360,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${primary}`,
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const frontStyle = {
    ...faceBaseStyle,
    cursor: 'pointer',
    zIndex: isFlipped ? 0 : 1,
  };

  const backStyle = {
    ...faceBaseStyle,
    transform: 'rotateY(180deg)',
    zIndex: isFlipped ? 1 : 0,
    cursor: 'default',
  };

  const topBarStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  };

  const categoryPillStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    background: `${primary}22`,
    color: accent,
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 700,
  };

  const difficultyBadgeStyle = difficulty ? {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: 0.5,
    color: difficulty.color,
    background: `${difficulty.color}18`,
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
  } : null;

  const seasonStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: 0.5,
    color: 'var(--text-muted)',
    marginLeft: 'auto',
  };

  const bookmarkStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    color: bookmarked ? 'var(--warning)' : 'var(--text-muted)',
    padding: '0 4px',
    transition: 'var(--transition)',
    lineHeight: 1,
  };

  const centerStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'var(--space-xl) var(--space-lg)',
    textAlign: 'center',
  };

  const hintStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: 1,
    padding: 'var(--space-md) var(--space-lg)',
    borderTop: '1px solid var(--border)',
    textAlign: 'center',
  };

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        {/* FRONT SIDE */}
        <div
          style={frontStyle}
          onClick={!isFlipped ? onFlip : undefined}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onFlip(); } }}
        >
          {/* Top bar */}
          <div style={topBarStyle}>
            <span style={categoryPillStyle}>{question.category}</span>
            {difficulty && <span style={difficultyBadgeStyle}>{difficulty.label}</span>}
            {question.is_ai_generated && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontWeight: 700,
                background: 'rgba(255, 186, 8, 0.15)',
                color: 'var(--warning)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 186, 8, 0.25)',
              }}>
                AI
              </span>
            )}
            {seasonInfo && <span style={seasonStyle}>{seasonInfo}</span>}
            <button
              style={bookmarkStyle}
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
              title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              {bookmarked ? '\u2605' : '\u2606'}
            </button>
          </div>

          {/* Question text */}
          <div style={centerStyle}>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              lineHeight: 1.6,
              color: 'var(--text)',
              maxWidth: 520,
            }}>
              {question.question_text}
            </div>
          </div>

          {/* Hint */}
          <div style={hintStyle}>
            Click or press Space to reveal
          </div>
        </div>

        {/* BACK SIDE */}
        <div style={backStyle}>
          {/* Top bar */}
          <div style={topBarStyle}>
            <span style={categoryPillStyle}>{question.category}</span>
            {difficulty && <span style={difficultyBadgeStyle}>{difficulty.label}</span>}
            {question.is_ai_generated && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontWeight: 700,
                background: 'rgba(255, 186, 8, 0.15)',
                color: 'var(--warning)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 186, 8, 0.25)',
              }}>
                AI
              </span>
            )}
            {seasonInfo && <span style={seasonStyle}>{seasonInfo}</span>}
            <button
              style={bookmarkStyle}
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
              title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              {bookmarked ? '\u2605' : '\u2606'}
            </button>
          </div>

          {/* Answer content */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-lg)',
            gap: 'var(--space-md)',
            overflowY: 'auto',
          }}>
            {/* Answer text */}
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.5,
              color: accent,
              textAlign: 'center',
              padding: 'var(--space-md) 0',
            }}>
              {question.answer}
            </div>

            {/* Percent correct */}
            {question.percent_correct != null && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                textAlign: 'center',
                letterSpacing: 0.5,
              }}>
                {question.percent_correct}% of players got this right
              </div>
            )}

            {/* Progress info */}
            {progress && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                textAlign: 'center',
                letterSpacing: 0.5,
                display: 'flex',
                justifyContent: 'center',
                gap: 'var(--space-md)',
                flexWrap: 'wrap',
              }}>
                <span>Seen {progress.times_seen || 0} times</span>
                <span>&middot;</span>
                <span>Correct {progress.times_correct || 0} times</span>
                {progress.next_review_at && (
                  <>
                    <span>&middot;</span>
                    <span>Next review: {formatDate(progress.next_review_at)}</span>
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            {notes && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-sm) var(--space-md)',
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 'var(--space-xs)',
                }}>
                  Note
                </div>
                {notes}
              </div>
            )}

            {/* Tags */}
            {tags && tags.length > 0 && (
              <div style={{
                display: 'flex',
                gap: 'var(--space-xs)',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}>
                {tags.map((tag) => (
                  <span key={tag} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 0.5,
                    background: 'rgba(108, 140, 255, 0.1)',
                    color: 'var(--info)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(108, 140, 255, 0.2)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Learn More panel */}
            <LearnMore questionId={question.id} isVisible={isFlipped} />
          </div>
        </div>
      </div>
    </div>
  );
}
