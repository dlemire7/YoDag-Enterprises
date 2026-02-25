export default function ProgressBar({ current, total, streak }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div style={{
      width: '100%',
      maxWidth: 640,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)',
    }}>
      {/* Text row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: 0.5,
          color: 'var(--text)',
        }}>
          {current} / {total}
        </span>
        {streak > 0 && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: 0.5,
            color: 'var(--warning)',
          }}>
            {'\uD83D\uDD25'} {streak} streak
          </span>
        )}
      </div>

      {/* Bar */}
      <div style={{
        width: '100%',
        height: 4,
        background: 'var(--border)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--info), var(--success))',
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}
