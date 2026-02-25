import { useState, useEffect } from 'react';

const RATINGS = [
  { value: 1, label: 'Again', color: 'var(--danger)', bgAlpha: 'rgba(255, 107, 107, 0.15)', borderAlpha: 'rgba(255, 107, 107, 0.35)' },
  { value: 2, label: 'Hard', color: 'var(--warning)', bgAlpha: 'rgba(255, 186, 8, 0.15)', borderAlpha: 'rgba(255, 186, 8, 0.35)' },
  { value: 3, label: 'Good', color: 'var(--info)', bgAlpha: 'rgba(72, 202, 228, 0.15)', borderAlpha: 'rgba(72, 202, 228, 0.35)' },
  { value: 4, label: 'Easy', color: 'var(--success)', bgAlpha: 'rgba(82, 183, 136, 0.15)', borderAlpha: 'rgba(82, 183, 136, 0.35)' },
];

const DEFAULT_INTERVALS = {
  1: '1 day',
  2: '1 day',
  3: '3 days',
  4: '1 week',
};

export default function RatingButtons({ onRate, disabled, nextReviewDates }) {
  const [rated, setRated] = useState(null);

  const intervals = nextReviewDates || DEFAULT_INTERVALS;

  useEffect(() => {
    if (rated !== null) {
      const timer = setTimeout(() => {
        onRate(rated);
        setRated(null);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [rated, onRate]);

  const handleRate = (value) => {
    if (disabled || rated !== null) return;
    setRated(value);
  };

  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-sm)',
      width: '100%',
      maxWidth: 640,
    }}>
      {RATINGS.map(({ value, label, color, bgAlpha, borderAlpha }) => {
        const isSelected = rated === value;
        return (
          <button
            key={value}
            onClick={() => handleRate(value)}
            disabled={disabled || rated !== null}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: 'var(--space-md) var(--space-sm)',
              background: isSelected ? bgAlpha.replace('0.15', '0.35') : bgAlpha,
              border: `1px solid ${borderAlpha}`,
              borderRadius: 'var(--radius-md)',
              cursor: disabled || rated !== null ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: rated !== null && !isSelected ? 0.4 : 1,
              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
              position: 'relative',
            }}
          >
            {/* Keyboard shortcut badge */}
            <span style={{
              position: 'absolute',
              top: 6,
              right: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: color,
              opacity: 0.6,
              background: 'rgba(0,0,0,0.3)',
              width: 16,
              height: 16,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {value}
            </span>

            {/* Label */}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              color: color,
              textTransform: 'uppercase',
            }}>
              {label}
            </span>

            {/* Interval subtitle */}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: color,
              opacity: 0.7,
              letterSpacing: 0.5,
            }}>
              {isSelected ? 'Next review set' : intervals[value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
