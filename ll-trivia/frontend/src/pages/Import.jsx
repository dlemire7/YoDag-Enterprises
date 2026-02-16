import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getStatsOverview,
  startScrape,
  getScrapeStatus,
  getExportJsonUrl,
  getExportCsvUrl,
  addQuestion,
} from '../api/client';
import { CATEGORY_COLORS } from '../styles/categories';

const categories = Object.keys(CATEGORY_COLORS);

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  transition: 'var(--transition)',
  outline: 'none',
};

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 0.5,
  color: 'var(--text-muted)',
  marginBottom: 'var(--space-xs)',
  textTransform: 'uppercase',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B8994' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
  cursor: 'pointer',
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 100,
  resize: 'vertical',
  lineHeight: 1.5,
};

/* ───────── Status Banner ───────── */
function StatusBanner() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStatsOverview()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const total = stats?.total_questions ?? 0;

  return (
    <div
      className="card"
      style={{
        marginBottom: 'var(--space-2xl)',
        borderTop: '2px solid var(--info)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
      }}
    >
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          fontFamily: 'var(--font-serif)',
          color: 'var(--info)',
          lineHeight: 1,
          minWidth: 64,
          textAlign: 'center',
        }}
      >
        {total.toLocaleString()}
      </div>
      <div>
        <div
          className="mono-label"
          style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}
        >
          Questions Loaded
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {total > 0
            ? 'Ready to study'
            : 'Import questions from LearnedLeague to get started'}
        </div>
      </div>
    </div>
  );
}

/* ───────── Scrape Section ───────── */
function ScrapeSection() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [startSeason, setStartSeason] = useState('');
  const [endSeason, setEndSeason] = useState('');

  const [scraping, setScraping] = useState(false);
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const logRef = useRef(null);
  const pollRef = useRef(null);

  // Derive a rough progress percentage from messages
  const progress = (() => {
    if (!scraping || !startSeason || !endSeason) return null;
    const start = parseInt(startSeason, 10);
    const end = parseInt(endSeason, 10);
    if (isNaN(start) || isNaN(end) || end <= start) return null;

    const totalSeasons = end - start + 1;
    // Count distinct season numbers mentioned in messages
    const seen = new Set();
    for (const msg of messages) {
      const m = msg.match(/season\s+(\d+)/i);
      if (m) seen.add(parseInt(m[1], 10));
    }
    const pct = Math.min(100, Math.round((seen.size / totalSeasons) * 100));
    return pct;
  })();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Check if a scrape is already running on mount
  useEffect(() => {
    getScrapeStatus()
      .then((data) => {
        if (data.running) {
          setScraping(true);
          setMessages(data.messages || []);
          startPolling();
        }
      })
      .catch(() => {});
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await getScrapeStatus();
        setMessages(data.messages || []);
        if (!data.running) {
          setScraping(false);
          stopPolling();
          if (data.result) setResult(data.result);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  }

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleStart() {
    if (!username || !password || !startSeason || !endSeason) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setResult(null);
    setMessages([]);
    try {
      await startScrape({
        username,
        password,
        start_season: parseInt(startSeason, 10),
        end_season: parseInt(endSeason, 10),
      });
      setScraping(true);
      startPolling();
    } catch (err) {
      setError(err.message || 'Failed to start scrape.');
    }
  }

  return (
    <>
      <h2 className="section-header">Scrape from LearnedLeague</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 640 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
            opacity: scraping ? 0.5 : 1,
            pointerEvents: scraping ? 'none' : 'auto',
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              placeholder="LL username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              disabled={scraping}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder="LL password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              disabled={scraping}
            />
          </div>
          <div>
            <label style={labelStyle}>Start Season</label>
            <input
              type="number"
              placeholder="e.g. 95"
              value={startSeason}
              onChange={(e) => setStartSeason(e.target.value)}
              style={inputStyle}
              disabled={scraping}
            />
          </div>
          <div>
            <label style={labelStyle}>End Season</label>
            <input
              type="number"
              placeholder="e.g. 103"
              value={endSeason}
              onChange={(e) => setEndSeason(e.target.value)}
              style={inputStyle}
              disabled={scraping}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              marginBottom: 'var(--space-md)',
            }}
          >
            {error}
          </div>
        )}

        <button
          className="btn btn--primary"
          onClick={handleStart}
          disabled={scraping}
          style={{
            opacity: scraping ? 0.5 : 1,
            cursor: scraping ? 'not-allowed' : 'pointer',
          }}
        >
          {scraping ? 'Scraping...' : 'Start Scrape'}
        </button>

        {/* Progress bar */}
        {scraping && progress !== null && (
          <div
            style={{
              marginTop: 'var(--space-md)',
              background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)',
              height: 6,
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--info)',
                borderRadius: 'var(--radius-sm)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        )}

        {/* Live log */}
        {(messages.length > 0 || scraping) && (
          <div
            ref={logRef}
            style={{
              marginTop: 'var(--space-md)',
              background: '#08080D',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-md)',
              maxHeight: 260,
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.7,
              color: '#7FE07F',
            }}
          >
            {scraping && messages.length === 0 && (
              <div style={{ color: 'var(--text-muted)' }}>Waiting for output...</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                  {String(i + 1).padStart(3, ' ')}
                </span>
                {msg}
              </div>
            ))}
            {scraping && (
              <div style={{ color: 'var(--info)', marginTop: 4 }}>
                <span className="scrape-pulse">&#9679;</span> Scraping...
              </div>
            )}
          </div>
        )}

        {/* Result summary */}
        {result && !scraping && (
          <div
            style={{
              marginTop: 'var(--space-md)',
              padding: 'var(--space-md)',
              background: 'rgba(82, 183, 136, 0.08)',
              border: '1px solid rgba(82, 183, 136, 0.2)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              display: 'flex',
              gap: 'var(--space-lg)',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Saved </span>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                {result.total_saved ?? 0}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Skipped </span>
              <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                {result.total_skipped ?? 0}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Errors </span>
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                {result.errors ?? 0}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Pulse animation for scraping indicator */}
      <style>{`
        @keyframes scrape-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        .scrape-pulse {
          animation: scrape-pulse 1.2s ease-in-out infinite;
          display: inline-block;
          margin-right: 6px;
        }
      `}</style>
    </>
  );
}

/* ───────── Manual Question Entry ───────── */
function ManualEntry() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    question_text: '',
    answer: '',
    category: '',
    season: '',
    match_day: '',
    question_number: '',
    percent_correct: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.question_text || !form.answer || !form.category) {
      setError('Question, Answer, and Category are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        question_text: form.question_text,
        answer: form.answer,
        category: form.category,
      };
      if (form.season) payload.season = parseInt(form.season, 10);
      if (form.match_day) payload.match_day = parseInt(form.match_day, 10);
      if (form.question_number) payload.question_number = parseInt(form.question_number, 10);
      if (form.percent_correct) payload.percent_correct = parseFloat(form.percent_correct);

      await addQuestion(payload);
      setForm({
        question_text: '',
        answer: '',
        category: '',
        season: '',
        match_day: '',
        question_number: '',
        percent_correct: '',
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add question.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h2
        className="section-header"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            marginRight: 8,
            fontSize: 10,
          }}
        >
          &#9654;
        </span>
        Add Question Manually
      </h2>

      {open && (
        <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 640 }}>
          <form onSubmit={handleSubmit}>
            {/* Question Text */}
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle}>
                Question Text <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                placeholder="Enter the question..."
                value={form.question_text}
                onChange={(e) => updateField('question_text', e.target.value)}
                style={textareaStyle}
                required
              />
            </div>

            {/* Answer */}
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle}>
                Answer <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Enter the answer..."
                value={form.answer}
                onChange={(e) => updateField('answer', e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle}>
                Category <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                style={selectStyle}
                required
              >
                <option value="">Select category...</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Season / Match Day / Question Number row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
              }}
            >
              <div>
                <label style={labelStyle}>Season</label>
                <input
                  type="number"
                  placeholder="e.g. 99"
                  value={form.season}
                  onChange={(e) => updateField('season', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Match Day</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  value={form.match_day}
                  onChange={(e) => updateField('match_day', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Question #</label>
                <input
                  type="number"
                  placeholder="e.g. 3"
                  value={form.question_number}
                  onChange={(e) => updateField('question_number', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Percent Correct */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <label style={labelStyle}>Percent Correct</label>
              <input
                type="number"
                placeholder="0 - 100"
                min={0}
                max={100}
                value={form.percent_correct}
                onChange={(e) => updateField('percent_correct', e.target.value)}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
            </div>

            {error && (
              <div
                style={{
                  color: 'var(--danger)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  marginBottom: 'var(--space-md)',
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  color: 'var(--success)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  marginBottom: 'var(--space-md)',
                }}
              >
                Question added successfully.
              </div>
            )}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting}
              style={{
                opacity: submitting ? 0.5 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Adding...' : 'Add Question'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ───────── Export Section ───────── */
function ExportSection() {
  return (
    <>
      <h2 className="section-header">Export Data</h2>
      <div className="card" style={{ maxWidth: 640 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-lg)',
            lineHeight: 1.6,
          }}
        >
          Download your question bank and study progress for backup or external use.
          JSON includes all metadata; CSV is a flat table suitable for spreadsheets.
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <a
            href={getExportJsonUrl()}
            className="btn btn--primary"
            download
            style={{ display: 'inline-block' }}
          >
            Export JSON
          </a>
          <a
            href={getExportCsvUrl()}
            className="btn"
            download
            style={{ display: 'inline-block' }}
          >
            Export CSV
          </a>
        </div>
      </div>
    </>
  );
}

/* ───────── Page Root ───────── */
export default function Import() {
  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Import & Data
      </h1>

      <StatusBanner />
      <ScrapeSection />
      <ManualEntry />
      <ExportSection />
    </div>
  );
}
