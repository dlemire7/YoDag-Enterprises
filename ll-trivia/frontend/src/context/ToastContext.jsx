import { createContext, useState, useCallback, useEffect, useRef } from 'react';

export const ToastContext = createContext(null);

let toastIdCounter = 0;

/* ------------------------------------------------------------------ */
/*  Toast Container (rendered inside the provider)                     */
/* ------------------------------------------------------------------ */

const TYPE_COLORS = {
  success: 'var(--success, #52B788)',
  error:   'var(--danger,  #FF6B6B)',
  warning: 'var(--warning, #FFBA08)',
  info:    'var(--info,    #48CAE4)',
};

function Toast({ toast, onClose }) {
  const { id, message, type, duration } = toast;
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const rafRef = useRef(null);

  /* Progress bar tick ------------------------------------------------ */
  useEffect(() => {
    const start = startRef.current;

    function tick() {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration]);

  /* Auto-dismiss ----------------------------------------------------- */
  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  /* After exit animation ends, actually remove the toast ------------- */
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => onClose(id), 300);
    return () => clearTimeout(timer);
  }, [exiting, id, onClose]);

  function handleClose() {
    setExiting(true);
  }

  const borderColor = TYPE_COLORS[type] || TYPE_COLORS.info;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 280,
        maxWidth: 400,
        padding: '12px 16px',
        background: 'rgba(18, 18, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border, #2A2A35)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 'var(--radius-md, 8px)',
        fontFamily: "var(--font-mono, 'Courier New', monospace)",
        fontSize: 12,
        letterSpacing: 0.5,
        color: 'var(--text, #E8E6E3)',
        overflow: 'hidden',
        animation: exiting
          ? 'toast-exit 300ms ease-in forwards'
          : 'toast-enter 300ms ease-out forwards',
      }}
    >
      {/* Message */}
      <span style={{ flex: 1, lineHeight: 1.5 }}>{message}</span>

      {/* Close button */}
      <button
        onClick={handleClose}
        aria-label="Close notification"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted, #8B8994)',
          cursor: 'pointer',
          fontFamily: "var(--font-mono, 'Courier New', monospace)",
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        X
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: `${progress}%`,
          height: 2,
          background: borderColor,
          transition: 'width 100ms linear',
        }}
      />
    </div>
  );
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes toast-enter {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toast-exit {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(100%); }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast toast={t} onClose={removeToast} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

const MAX_TOASTS = 5;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastIdCounter;

    setToasts((prev) => {
      const next = [...prev, { id, message, type, duration }];
      // Keep only the newest MAX_TOASTS entries
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });

    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}
