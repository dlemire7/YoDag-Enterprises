import { useState, useEffect, useRef } from 'react';

export default function QuizTimer({ seconds, onTimeUp, isPaused }) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef(null);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (isPaused || remaining <= 0) {
      clearInterval(intervalRef.current);
      if (remaining <= 0) onTimeUp?.();
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [isPaused, remaining, onTimeUp]);

  const pct = seconds > 0 ? (remaining / seconds) * 100 : 100;
  const isUrgent = remaining <= 5;
  const barColor = isUrgent ? 'var(--danger)' : remaining <= 10 ? 'var(--warning)' : 'var(--info)';

  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      {/* Timer bar */}
      <div style={{
        height: 4,
        background: 'var(--border)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 2,
          transition: 'width 1s linear, background 0.3s ease',
        }} />
      </div>

      {/* Timer text */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 1,
        color: barColor,
        animation: isUrgent ? 'pulse 0.5s infinite alternate' : 'none',
      }}>
        {remaining}s
      </div>

      <style>{`
        @keyframes pulse {
          from { opacity: 1; }
          to { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
