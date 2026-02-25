import { useEffect } from 'react';

const SHORTCUTS = [
  { key: 'Space', description: 'Flip card' },
  { key: '1', description: 'Rate Again' },
  { key: '2', description: 'Rate Hard' },
  { key: '3', description: 'Rate Good' },
  { key: '4', description: 'Rate Easy' },
  { key: 'S / \u2192', description: 'Skip question' },
  { key: 'B', description: 'Toggle bookmark' },
  { key: 'N', description: 'Toggle notes' },
  { key: '?', description: 'Show / hide shortcuts' },
];

export default function KeyboardShortcutHelp({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-xl)',
          minWidth: 340,
          maxWidth: 420,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)',
        }}>
          <span className="section-header" style={{ margin: 0 }}>
            Keyboard Shortcuts
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '4px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Shortcuts grid */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}>
          {SHORTCUTS.map(({ key, description }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-xs) 0',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                color: 'var(--text)',
              }}>
                {description}
              </span>
              <kbd style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 0.5,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 8px',
                color: 'var(--info)',
                minWidth: 32,
                textAlign: 'center',
              }}>
                {key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: 'var(--space-lg)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: 0.5,
          textAlign: 'center',
        }}>
          Press Escape or ? to close
        </div>
      </div>
    </div>
  );
}
