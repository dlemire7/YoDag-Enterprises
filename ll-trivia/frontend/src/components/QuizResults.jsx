import { getCategoryColor } from '../styles/categories';

export default function QuizResults({ answers, questions, onNewSession, onChangeFilters }) {
  const total = answers.length;
  const correct = answers.filter((a) => a.was_correct).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Category breakdown
  const categoryMap = {};
  answers.forEach((ans) => {
    const q = questions.find((qu) => qu.id === ans.question_id);
    if (!q) return;
    const cat = q.category || 'UNKNOWN';
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, correct: 0 };
    categoryMap[cat].total += 1;
    if (ans.was_correct) categoryMap[cat].correct += 1;
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, data]) => ({
      category: cat,
      total: data.total,
      correct: data.correct,
      accuracy: Math.round((data.correct / data.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  // Time stats
  const totalTimeMs = answers.reduce((sum, a) => sum + (a.time_taken_ms || 0), 0);
  const avgTimeSec = total > 0 ? (totalTimeMs / total / 1000).toFixed(1) : '—';

  const accentColor = accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      minHeight: 400,
      paddingTop: 'var(--space-lg)',
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: 560,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-2xl)',
        gap: 'var(--space-lg)',
      }}>
        <div className="section-header" style={{ margin: 0 }}>
          Quiz Complete
        </div>

        {/* Big accuracy */}
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 48,
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1,
        }}>
          {accuracy}%
        </div>

        {/* Score summary */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-xl)',
          justifyContent: 'center',
        }}>
          {[
            { value: total, label: 'Questions', color: 'var(--text)' },
            { value: correct, label: 'Correct', color: 'var(--success)' },
            { value: total - correct, label: 'Missed', color: 'var(--danger)' },
            { value: `${avgTimeSec}s`, label: 'Avg Time', color: 'var(--info)' },
          ].map(({ value, label, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 700,
                color,
              }}>
                {value}
              </div>
              <div className="mono-label" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        {categoryBreakdown.length > 0 && (
          <div style={{ width: '100%' }}>
            <div className="section-header" style={{ marginTop: 'var(--space-md)' }}>
              By Category
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {categoryBreakdown.map(({ category, total: catTotal, correct: catCorrect, accuracy: catAcc }) => {
                const { primary } = getCategoryColor(category);
                const barColor = catAcc >= 70 ? 'var(--success)' : catAcc >= 40 ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div key={category} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: `3px solid ${primary}`,
                  }}>
                    <span className="mono-label" style={{
                      color: 'var(--text)',
                      textTransform: 'uppercase',
                      minWidth: 100,
                    }}>
                      {category}
                    </span>
                    <div style={{
                      flex: 1,
                      height: 6,
                      background: 'var(--border)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${catAcc}%`,
                        background: barColor,
                        borderRadius: 3,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      color: barColor,
                      minWidth: 60,
                      textAlign: 'right',
                    }}>
                      {catCorrect}/{catTotal} ({catAcc}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
          <button className="btn btn--primary" onClick={onNewSession}>
            New Quiz
          </button>
          <button className="btn" onClick={onChangeFilters}>
            Change Filters
          </button>
        </div>
      </div>
    </div>
  );
}
