import { useState } from 'react';
import { addTag, removeTag } from '../api/client';

export default function TagManager({ questionId, tags, onTagsChanged }) {
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || busy) return;
    if (tags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    setBusy(true);
    try {
      const result = await addTag(questionId, trimmed);
      onTagsChanged(result.tags);
      setInputValue('');
    } catch (err) {
      console.error('Failed to add tag:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (tag) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await removeTag(questionId, tag);
      onTagsChanged(result.tags);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAdd();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      width: '100%',
      maxWidth: 640,
    }}>
      {/* Existing tags */}
      {tags.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-xs)',
          flexWrap: 'wrap',
        }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 0.5,
              background: 'rgba(108, 140, 255, 0.1)',
              color: 'var(--info)',
              padding: '3px 6px 3px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(108, 140, 255, 0.2)',
            }}>
              {tag}
              <button
                onClick={() => handleRemove(tag)}
                disabled={busy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--info)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  padding: '0 2px',
                  opacity: 0.6,
                }}
                title={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add tag input */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add tag..."
          style={{
            padding: '5px 10px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 0.5,
            outline: 'none',
            width: 140,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--info)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
        />
        <button
          onClick={handleAdd}
          disabled={busy || !inputValue.trim()}
          className="btn btn--primary"
          style={{
            fontSize: 10,
            padding: '5px 10px',
            opacity: busy || !inputValue.trim() ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
