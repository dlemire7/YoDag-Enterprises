import { useState } from 'react';
import { saveNote } from '../api/client';

export default function NoteEditor({ questionId, initialNote, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveNote(questionId, text);
      onSaved(text);
      setExpanded(false);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setText(initialNote || '');
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-sm) var(--space-md)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 0.5,
          color: 'var(--text-muted)',
          transition: 'var(--transition)',
          textAlign: 'left',
          width: '100%',
          maxWidth: 640,
        }}
      >
        {initialNote
          ? initialNote.length > 60
            ? initialNote.slice(0, 60) + '...'
            : initialNote
          : '+ Add note'}
      </button>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      width: '100%',
      maxWidth: 640,
    }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        placeholder="Write a note about this question..."
        style={{
          width: '100%',
          minHeight: 80,
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)',
          fontFamily: 'var(--font-serif)',
          fontSize: 14,
          lineHeight: 1.5,
          resize: 'vertical',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--info)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border)';
        }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
        <button
          onClick={handleCancel}
          className="btn"
          style={{ fontSize: 11, padding: '6px 14px' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn--primary"
          style={{ fontSize: 11, padding: '6px 14px', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}
