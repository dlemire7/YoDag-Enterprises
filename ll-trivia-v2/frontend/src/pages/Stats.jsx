import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  getStatsOverview,
  getStatsCategories,
  getStatsTrends,
  getStatsHeatmap,
  getStatsWeakest,
  getSessions,
  getSessionAnswers,
} from '../api/client';
import { getCategoryColor } from '../styles/categories';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSessionDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return '--';
  const ms = new Date(completedAt) - new Date(startedAt);
  if (ms < 0) return '--';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function truncate(str, len = 60) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ---------------------------------------------------------------------------
// Skeleton / Loading
// ---------------------------------------------------------------------------

function SkeletonBlock({ height = 100, style = {} }) {
  return (
    <div
      className="card"
      style={{
        height,
        background: 'var(--surface)',
        opacity: 0.5,
        animation: 'stats-pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

function LoadingState() {
  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Statistics
      </h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} />
        ))}
      </div>
      <SkeletonBlock height={300} style={{ marginBottom: 'var(--space-2xl)' }} />
      <SkeletonBlock height={160} style={{ marginBottom: 'var(--space-2xl)' }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBlock key={i} height={90} />
        ))}
      </div>
      <SkeletonBlock height={200} />
      <style>{`
        @keyframes stats-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function ErrorState({ message }) {
  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Statistics
      </h1>
      <div className="card" style={{
        borderTop: '2px solid var(--danger)',
        textAlign: 'center',
        padding: 'var(--space-2xl)',
      }}>
        <div className="mono-label" style={{ color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>
          Error Loading Statistics
        </div>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-lg)',
        }}>
          {message}
        </div>
        <button className="btn btn--primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Recharts Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--space-sm) var(--space-md)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
        {formatShortDate(label)}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.dataKey === 'accuracy' ? `${entry.value}% accuracy` : `${entry.value} questions`}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Heatmap (custom SVG)
// ---------------------------------------------------------------------------

const HEATMAP_CELL = 13;
const HEATMAP_GAP = 3;
const HEATMAP_RADIUS = 2;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

function getHeatmapColor(count) {
  if (count === 0) return 'var(--border)';
  if (count <= 2) return '#1a4d2e';
  if (count <= 5) return '#2d7a4a';
  return 'var(--success)';
}

function ActivityHeatmap({ data }) {
  const [tooltip, setTooltip] = useState(null);

  // Build a map of date -> count
  const countMap = useMemo(() => {
    const m = {};
    if (data) {
      data.forEach(({ date, count }) => { m[date] = count; });
    }
    return m;
  }, [data]);

  // Build 52 weeks x 7 days grid, ending at today
  const { grid, monthLabels } = useMemo(() => {
    const today = new Date();
    // Find the most recent Sunday (end of current week column)
    const endDate = new Date(today);

    // Go back ~364 days to get start, then align to Monday
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 363);
    // Align to Monday (1 = Monday)
    const startDay = startDate.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    startDate.setDate(startDate.getDate() + mondayOffset);

    const weeks = [];
    const mLabels = [];
    let lastMonth = -1;
    const cursor = new Date(startDate);

    let weekIdx = 0;
    while (cursor <= endDate || weeks.length < 52) {
      const week = [];
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const dateStr = cursor.toISOString().split('T')[0];
        const isAfterToday = cursor > today;
        week.push({
          date: dateStr,
          count: isAfterToday ? -1 : (countMap[dateStr] || 0),
          dayIdx,
        });

        // Track month label positions
        if (cursor.getDate() <= 7 && dayIdx === 0 && cursor.getMonth() !== lastMonth) {
          mLabels.push({ weekIdx, month: cursor.getMonth() });
          lastMonth = cursor.getMonth();
        }

        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      weekIdx++;
      if (weeks.length >= 53) break;
    }

    return { grid: weeks, monthLabels: mLabels };
  }, [countMap]);

  const labelWidth = 32;
  const topPadding = 20;
  const svgWidth = labelWidth + grid.length * (HEATMAP_CELL + HEATMAP_GAP);
  const svgHeight = topPadding + 7 * (HEATMAP_CELL + HEATMAP_GAP);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ overflowX: 'auto', paddingBottom: 'var(--space-sm)' }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block' }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Month labels */}
          {monthLabels.map(({ weekIdx: wi, month }) => (
            <text
              key={`m-${wi}`}
              x={labelWidth + wi * (HEATMAP_CELL + HEATMAP_GAP)}
              y={12}
              style={{
                fill: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
              }}
            >
              {MONTH_LABELS[month]}
            </text>
          ))}

          {/* Day labels */}
          {DAY_LABELS.map((label, idx) => (
            label ? (
              <text
                key={`d-${idx}`}
                x={0}
                y={topPadding + idx * (HEATMAP_CELL + HEATMAP_GAP) + HEATMAP_CELL - 2}
                style={{
                  fill: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                }}
              >
                {label}
              </text>
            ) : null
          ))}

          {/* Cells */}
          {grid.map((week, wi) =>
            week.map((day) => {
              if (day.count < 0) return null; // future date
              return (
                <rect
                  key={day.date}
                  x={labelWidth + wi * (HEATMAP_CELL + HEATMAP_GAP)}
                  y={topPadding + day.dayIdx * (HEATMAP_CELL + HEATMAP_GAP)}
                  width={HEATMAP_CELL}
                  height={HEATMAP_CELL}
                  rx={HEATMAP_RADIUS}
                  ry={HEATMAP_RADIUS}
                  fill={getHeatmapColor(day.count)}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
                  onMouseEnter={(e) => {
                    const rect = e.target.getBoundingClientRect();
                    const container = e.target.closest('div').getBoundingClientRect();
                    setTooltip({
                      x: rect.left - container.left + HEATMAP_CELL / 2,
                      y: rect.top - container.top - 8,
                      date: day.date,
                      count: day.count,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>{formatShortDate(tooltip.date)}</span>
          {' -- '}
          <span style={{ color: tooltip.count > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {tooltip.count} {tooltip.count === 1 ? 'question' : 'questions'}
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 'var(--space-xs)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text-muted)',
      }}>
        <span>Less</span>
        {[0, 1, 3, 6].map((v) => (
          <div
            key={v}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: getHeatmapColor(v),
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session History (with expandable answers)
// ---------------------------------------------------------------------------

function SessionRow({ session }) {
  const [expanded, setExpanded] = useState(false);
  const [answers, setAnswers] = useState(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  const date = formatSessionDate(session.started_at);
  const mode = (session.mode || 'study').toUpperCase();
  const correct = session.correct_count ?? 0;
  const total = session.question_count ?? 0;
  const duration = formatDuration(session.started_at, session.completed_at);
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!answers && session.id) {
      setLoadingAnswers(true);
      try {
        const data = await getSessionAnswers(session.id);
        setAnswers(data.answers || []);
      } catch {
        setAnswers([]);
      } finally {
        setLoadingAnswers(false);
      }
    }
  }, [expanded, answers, session.id]);

  return (
    <div>
      <div
        onClick={handleToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto auto',
          alignItems: 'center',
          gap: 'var(--space-lg)',
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'var(--transition)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span className="mono-label" style={{ color: 'var(--text-muted)' }}>
          {date}
        </span>
        <span className="mono-label" style={{
          color: 'var(--info)',
          textTransform: 'uppercase',
          minWidth: 60,
          textAlign: 'center',
        }}>
          {mode}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 700,
          color: scorePct >= 70 ? 'var(--success)' : scorePct >= 40 ? 'var(--warning)' : 'var(--danger)',
          minWidth: 50,
          textAlign: 'right',
        }}>
          {correct}/{total}
        </span>
        <span className="mono-label" style={{ color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
          {duration}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          transition: 'transform 0.2s ease',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          &#9662;
        </span>
      </div>

      {expanded && (
        <div style={{
          background: 'rgba(10, 10, 15, 0.5)',
          borderBottom: '1px solid var(--border)',
        }}>
          {loadingAnswers && (
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              Loading answers...
            </div>
          )}
          {answers && answers.length === 0 && (
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              No answer data available.
            </div>
          )}
          {answers && answers.length > 0 && answers.map((a, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-sm) var(--space-lg) var(--space-sm) var(--space-2xl)',
                borderBottom: idx < answers.length - 1 ? '1px solid rgba(42, 42, 53, 0.5)' : 'none',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: a.was_correct ? 'var(--success)' : 'var(--danger)',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 13,
                color: 'var(--text)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {a.question?.question_text ? truncate(a.question.question_text, 80) : 'Unknown question'}
              </span>
              {a.question?.category && (
                <span className="mono-label" style={{
                  color: getCategoryColor(a.question.category).primary,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>
                  {a.question.category}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Stats Component
// ---------------------------------------------------------------------------

export default function Stats() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [trends, setTrends] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [weakest, setWeakest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionTotal, setSessionTotal] = useState(0);

  const [trendDays, setTrendDays] = useState(30);
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [overviewRes, categoriesRes, trendsRes, heatmapRes, weakestRes, sessionsRes] =
          await Promise.all([
            getStatsOverview(),
            getStatsCategories(),
            getStatsTrends(30),
            getStatsHeatmap(),
            getStatsWeakest(),
            getSessions({ limit: 10 }),
          ]);

        if (cancelled) return;

        setOverview(overviewRes);
        setCategories(Array.isArray(categoriesRes) ? categoriesRes : []);
        setTrends(trendsRes);
        setHeatmap(Array.isArray(heatmapRes) ? heatmapRes : []);
        setWeakest(Array.isArray(weakestRes) ? weakestRes : []);

        const sessArr = sessionsRes?.sessions || sessionsRes || [];
        setSessions(Array.isArray(sessArr) ? sessArr : []);
        setSessionTotal(sessionsRes?.total ?? 0);

        // Build initial trend chart data
        if (trendsRes?.dates) {
          setTrendData(
            trendsRes.dates.map((d, i) => ({
              date: d,
              accuracy: trendsRes.accuracy?.[i] ?? 0,
              count: trendsRes.count?.[i] ?? 0,
            }))
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // Trend days switcher
  useEffect(() => {
    if (loading) return; // skip on initial load

    let cancelled = false;
    setTrendLoading(true);

    getStatsTrends(trendDays)
      .then((res) => {
        if (cancelled) return;
        if (res?.dates) {
          setTrendData(
            res.dates.map((d, i) => ({
              date: d,
              accuracy: res.accuracy?.[i] ?? 0,
              count: res.count?.[i] ?? 0,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTrendLoading(false); });

    return () => { cancelled = true; };
  }, [trendDays, loading]);

  // ------- Render -------

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const {
    total_questions = 0,
    total_studied = 0,
    accuracy_pct = 0,
    current_streak = 0,
    longest_streak = 0,
    questions_today = 0,
  } = overview || {};

  const statCards = [
    {
      label: 'Questions Studied',
      value: total_studied.toLocaleString(),
      color: 'var(--info)',
      sub: `of ${total_questions.toLocaleString()} total`,
    },
    {
      label: 'Overall Accuracy',
      value: `${Math.round(accuracy_pct)}%`,
      color: 'var(--success)',
      sub: `${questions_today} studied today`,
    },
    {
      label: 'Study Sessions',
      value: sessionTotal.toLocaleString(),
      color: 'var(--cat-entertainment)',
      sub: sessions.length > 0 ? `last: ${formatShortDate(sessions[0]?.started_at)}` : 'none yet',
    },
    {
      label: 'Study Streak',
      value: `${current_streak}`,
      color: 'var(--warning)',
      sub: longest_streak > 0 ? `best: ${longest_streak} days` : 'start today',
    },
  ];

  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Statistics
      </h1>

      {/* ============================================================
          1. Overview Cards
          ============================================================ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {statCards.map(({ label, value, color, sub }) => (
          <div key={label} className="card" style={{ borderTop: `2px solid ${color}` }}>
            <div className="mono-label" style={{
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-sm)',
              textTransform: 'uppercase',
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: 'var(--font-serif)',
              color,
              lineHeight: 1.1,
            }}>
              {value}
            </div>
            {sub && (
              <div className="mono-label" style={{
                color: 'var(--text-muted)',
                marginTop: 'var(--space-xs)',
              }}>
                {sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ============================================================
          2. Accuracy Trend Chart
          ============================================================ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-md)',
      }}>
        <h2 className="section-header" style={{ marginBottom: 0 }}>
          Accuracy Trend
        </h2>
        <div className="pill-tabs" style={{ width: 'auto' }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={`pill-tab${trendDays === d ? ' pill-tab--active' : ''}`}
              onClick={() => setTrendDays(d)}
              style={{ padding: '6px 14px', minWidth: 0, flex: 'none' }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{
        marginBottom: 'var(--space-2xl)',
        padding: 'var(--space-lg) var(--space-sm) var(--space-md) 0',
        position: 'relative',
      }}>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
                stroke="var(--border)"
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="accuracy"
                orientation="left"
                domain={[0, 100]}
                tick={{ fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
                stroke="var(--border)"
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                width={45}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
                stroke="var(--border)"
                tickLine={false}
                width={35}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                yAxisId="count"
                dataKey="count"
                fill="rgba(72, 202, 228, 0.15)"
                radius={[3, 3, 0, 0]}
                barSize={trendDays <= 7 ? 20 : trendDays <= 30 ? 10 : 5}
              />
              <Line
                yAxisId="accuracy"
                type="monotone"
                dataKey="accuracy"
                stroke="var(--info)"
                strokeWidth={2}
                dot={trendDays <= 30 ? { r: 3, fill: 'var(--info)', strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: 'var(--info)', strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            height: 280,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: 1,
          }}>
            No trend data yet -- start studying to see your progress
          </div>
        )}
        {trendLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10, 10, 15, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 'var(--radius-lg)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            Loading...
          </div>
        )}
      </div>

      {/* ============================================================
          3. Activity Heatmap
          ============================================================ */}
      <h2 className="section-header">Activity Heatmap</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)' }}>
        {heatmap.length > 0 ? (
          <ActivityHeatmap data={heatmap} />
        ) : (
          <div style={{
            minHeight: 120,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: 1,
          }}>
            No activity data yet -- study questions to fill the heatmap
          </div>
        )}
      </div>

      {/* ============================================================
          4. Category Mastery Grid
          ============================================================ */}
      <h2 className="section-header">Category Mastery</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {categories.map((cat) => {
          const { primary } = getCategoryColor(cat.category);
          const mastery = Math.round(cat.mastery_pct || 0);
          const accuracy = Math.round(cat.accuracy_pct || 0);

          return (
            <div
              key={cat.category}
              className="card card--accent"
              onClick={() => navigate(`/study?category=${encodeURIComponent(cat.category)}`)}
              style={{
                '--accent-color': primary,
                padding: 'var(--space-md)',
                cursor: 'pointer',
              }}
            >
              <div className="mono-label" style={{
                color: 'var(--text)',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-sm)',
                fontWeight: 700,
              }}>
                {cat.category}
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
                alignItems: 'center',
              }}>
                <span className="mono-label" style={{ color: 'var(--text-muted)' }}>
                  {cat.studied} / {cat.total}
                </span>
                <span className="mono-label" style={{ color: primary, fontWeight: 700 }}>
                  {accuracy}% acc
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================
          5. Weakest Questions Table
          ============================================================ */}
      <h2 className="section-header">Weakest Questions</h2>
      <div className="card" style={{
        marginBottom: 'var(--space-2xl)',
        padding: 0,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Question', 'Category', 'Attempts', 'Accuracy'].map((h) => (
                <th key={h} style={{
                  padding: 'var(--space-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  textAlign: 'left',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weakest.length === 0 ? (
              <tr>
                <td colSpan={4} style={{
                  padding: 'var(--space-xl)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}>
                  No data yet -- start studying to see your weakest questions
                </td>
              </tr>
            ) : (
              weakest.map((q) => {
                const catColor = getCategoryColor(q.category).primary;
                const acc = q.accuracy ?? q.percent_correct ?? 0;
                const attempts = q.progress?.times_seen ?? 0;

                return (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/study?category=${encodeURIComponent(q.category)}`)}
                    style={{ cursor: 'pointer', transition: 'var(--transition)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'var(--font-serif)',
                      fontSize: 14,
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      maxWidth: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {truncate(q.question_text, 70)}
                    </td>
                    <td style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: catColor,
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>
                      {q.category}
                    </td>
                    <td style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'center',
                    }}>
                      {attempts}
                    </td>
                    <td style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: acc >= 50 ? 'var(--warning)' : 'var(--danger)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {Math.round(acc)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ============================================================
          6. Session History
          ============================================================ */}
      <h2 className="section-header">Session History</h2>
      <div className="card" style={{
        padding: 0,
        overflow: 'hidden',
        marginBottom: 'var(--space-2xl)',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto auto',
          alignItems: 'center',
          gap: 'var(--space-lg)',
          padding: 'var(--space-sm) var(--space-lg)',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Date', 'Mode', 'Score', 'Duration', ''].map((h) => (
            <span key={h} className="mono-label" style={{
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: 9,
              textAlign: h === 'Score' || h === 'Duration' ? 'right' : 'left',
              minWidth: h === 'Mode' ? 60 : h === 'Score' || h === 'Duration' ? 50 : 'auto',
            }}>
              {h}
            </span>
          ))}
        </div>

        {sessions.length === 0 ? (
          <div style={{
            padding: 'var(--space-xl)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}>
            No sessions yet -- complete a study session to see your history
          </div>
        ) : (
          sessions.map((s, idx) => (
            <SessionRow key={s.id || idx} session={s} />
          ))
        )}
      </div>
    </div>
  );
}
