import { useState, useEffect, useRef, useCallback } from 'react';
import { getSettings, updateSettings, resetProgress, clearAICache } from '../api/client';

const SHORTCUTS = [
  { key: 'Space', desc: 'Flip card' },
  { key: '1 / 2 / 3 / 4', desc: 'Rate (flashcard mode)' },
  { key: 'Y', desc: 'Got It (quiz mode)' },
  { key: 'X', desc: 'Missed It (quiz mode)' },
  { key: 'S / \u2192', desc: 'Skip' },
  { key: 'B', desc: 'Toggle bookmark' },
  { key: 'N', desc: 'Toggle notes' },
  { key: 'L', desc: 'Learn More' },
  { key: '?', desc: 'Show shortcuts help' },
];

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
  boxSizing: 'border-box',
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

const hintStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-muted)',
  marginTop: 'var(--space-xs)',
};

function useSaveFeedback() {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((text, isError = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage({ text, isError });
    timerRef.current = setTimeout(() => setMessage(null), 2500);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const element = message ? (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: message.isError ? 'var(--danger)' : 'var(--success)',
      marginLeft: 'var(--space-md)',
      transition: 'opacity 0.3s',
    }}>
      {message.text}
    </span>
  ) : null;

  return [element, show];
}

function useConfirmAction(action) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  const trigger = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
    await action();
  }, [confirming, action]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return [confirming, trigger];
}

export default function Settings() {
  // API config
  const [apiKey, setApiKey] = useState('');
  const [llUsername, setLlUsername] = useState('');
  const [llPassword, setLlPassword] = useState('');

  // Study preferences
  const [dailyGoal, setDailyGoal] = useState('20');
  const [questionCount, setQuestionCount] = useState('10');
  const [timer, setTimer] = useState('30');

  // Theme
  const [theme, setTheme] = useState('dark');

  // Loading
  const [loading, setLoading] = useState(true);

  // Feedback hooks
  const [apiFeedback, showApiFeedback] = useSaveFeedback();
  const [prefsFeedback, showPrefsFeedback] = useSaveFeedback();
  const [themeFeedback, showThemeFeedback] = useSaveFeedback();
  const [resetFeedback, showResetFeedback] = useSaveFeedback();
  const [cacheFeedback, showCacheFeedback] = useSaveFeedback();

  // Apply theme to document
  const applyTheme = useCallback((t) => {
    if (t === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getSettings();
        if (cancelled) return;
        setApiKey(settings.anthropic_api_key || '');
        setLlUsername(settings.ll_username || '');
        setLlPassword(settings.ll_password || '');
        setDailyGoal(String(settings.daily_goal ?? 20));
        setQuestionCount(String(settings.default_question_count ?? 10));
        setTimer(String(settings.default_timer ?? 30));
        const t = settings.theme || 'dark';
        setTheme(t);
        applyTheme(t);
      } catch {
        // Settings may not exist yet, use defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyTheme]);

  // Save API settings
  const handleSaveApi = async () => {
    try {
      await updateSettings({
        anthropic_api_key: apiKey,
        ll_username: llUsername,
        ll_password: llPassword,
      });
      showApiFeedback('Saved!');
    } catch (e) {
      showApiFeedback(e.message || 'Save failed', true);
    }
  };

  // Save preferences
  const handleSavePrefs = async () => {
    try {
      await updateSettings({
        daily_goal: Number(dailyGoal),
        default_question_count: Number(questionCount),
        default_timer: Number(timer),
      });
      showPrefsFeedback('Saved!');
    } catch (e) {
      showPrefsFeedback(e.message || 'Save failed', true);
    }
  };

  // Toggle theme
  const handleThemeToggle = async (newTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    try {
      await updateSettings({ theme: newTheme });
      showThemeFeedback('Saved!');
    } catch (e) {
      showThemeFeedback(e.message || 'Save failed', true);
    }
  };

  // Confirm actions for data management
  const handleReset = useCallback(async () => {
    try {
      const result = await resetProgress();
      showResetFeedback(result.message || 'Progress reset.');
    } catch (e) {
      showResetFeedback(e.message || 'Reset failed', true);
    }
  }, [showResetFeedback]);

  const handleClearCache = useCallback(async () => {
    try {
      const result = await clearAICache();
      showCacheFeedback(`Cleared ${result.cleared ?? 0} cached items.`);
    } catch (e) {
      showCacheFeedback(e.message || 'Clear failed', true);
    }
  }, [showCacheFeedback]);

  const [resetConfirming, triggerReset] = useConfirmAction(handleReset);
  const [cacheConfirming, triggerClearCache] = useConfirmAction(handleClearCache);

  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 'var(--space-xl)' }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div>
      <h1 className="section-header" style={{ marginBottom: 'var(--space-xl)' }}>
        Settings
      </h1>

      {/* ── API Configuration ── */}
      <h2 className="section-header">API Configuration</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <label style={labelStyle}>Anthropic API Key</label>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>Used for AI-powered Learn More feature</div>
          </div>
          <div>
            <label style={labelStyle}>LearnedLeague Username</label>
            <input
              type="text"
              placeholder="your_username"
              value={llUsername}
              onChange={(e) => setLlUsername(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>LearnedLeague Password</label>
            <input
              type="password"
              placeholder="your_password"
              value={llPassword}
              onChange={(e) => setLlPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center' }}>
          <button className="btn btn--primary" onClick={handleSaveApi}>Save API Settings</button>
          {apiFeedback}
        </div>
      </div>

      {/* ── Study Preferences ── */}
      <h2 className="section-header">Study Preferences</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 560 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 'var(--space-md)',
        }}>
          <div>
            <label style={labelStyle}>Daily Goal</label>
            <input
              type="number"
              min="1"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>questions/day</div>
          </div>
          <div>
            <label style={labelStyle}>Default Count</label>
            <input
              type="number"
              min="1"
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>per session</div>
          </div>
          <div>
            <label style={labelStyle}>Timer (sec)</label>
            <input
              type="number"
              min="0"
              value={timer}
              onChange={(e) => setTimer(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>0 = no timer</div>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center' }}>
          <button className="btn btn--primary" onClick={handleSavePrefs}>Save Preferences</button>
          {prefsFeedback}
        </div>
      </div>

      {/* ── Theme ── */}
      <h2 className="section-header">Theme</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={{
            display: 'inline-flex',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => handleThemeToggle('dark')}
              style={{
                padding: '8px 20px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                border: 'none',
                cursor: 'pointer',
                transition: 'var(--transition)',
                background: theme === 'dark' ? 'var(--text)' : 'transparent',
                color: theme === 'dark' ? 'var(--bg)' : 'var(--text-muted)',
              }}
            >
              Dark
            </button>
            <button
              onClick={() => handleThemeToggle('light')}
              style={{
                padding: '8px 20px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                border: 'none',
                borderLeft: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                background: theme === 'light' ? 'var(--text)' : 'transparent',
                color: theme === 'light' ? 'var(--bg)' : 'var(--text-muted)',
              }}
            >
              Light
            </button>
          </div>
          {themeFeedback}
        </div>
      </div>

      {/* ── Keyboard Shortcuts ── */}
      <h2 className="section-header">Keyboard Shortcuts</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 560 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '10px 20px',
          alignItems: 'center',
        }}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} style={{ display: 'contents' }}>
              <kbd style={{
                display: 'inline-block',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
                letterSpacing: 0.3,
                whiteSpace: 'nowrap',
                textAlign: 'center',
                minWidth: 60,
              }}>
                {key}
              </kbd>
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                color: 'var(--text-muted)',
              }}>
                {desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Management ── */}
      <h2 className="section-header">Data Management</h2>
      <div className="card" style={{ marginBottom: 'var(--space-2xl)', maxWidth: 560 }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 14,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-lg)',
        }}>
          These actions cannot be undone. Use with caution.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* Reset Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button
              className="btn btn--danger"
              onClick={triggerReset}
              style={{
                minWidth: 160,
                transition: 'var(--transition)',
              }}
            >
              {resetConfirming ? 'Confirm?' : 'Reset All Progress'}
            </button>
            {!resetConfirming && !resetFeedback && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Deletes all study progress, sessions, and daily activity
              </span>
            )}
            {resetFeedback}
          </div>

          {/* Clear AI Cache */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button
              className="btn btn--danger"
              onClick={triggerClearCache}
              style={{
                minWidth: 160,
                transition: 'var(--transition)',
              }}
            >
              {cacheConfirming ? 'Confirm?' : 'Clear AI Cache'}
            </button>
            {!cacheConfirming && !cacheFeedback && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Cached explanations will regenerate on next use
              </span>
            )}
            {cacheFeedback}
          </div>
        </div>
      </div>

      {/* ── About ── */}
      <h2 className="section-header">About</h2>
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          color: 'var(--text)',
          marginBottom: 'var(--space-sm)',
          fontWeight: 600,
        }}>
          LL Trivia Study v2
        </div>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 14,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: 'var(--space-sm)',
        }}>
          A study companion for LearnedLeague trivia. Practice with flashcards and quizzes,
          track your progress across categories, and use AI-powered explanations to deepen
          your knowledge.
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: 0.3,
        }}>
          React + Flask &middot; Built for learning
        </div>
      </div>
    </div>
  );
}
