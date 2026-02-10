import React from 'react'

const CUISINE_COLORS = [
  { keywords: ['french', 'european'], colors: ['#1a237e', '#283593'] },
  { keywords: ['japanese', 'sushi', 'omakase', 'kaiseki'], colors: ['#b71c1c', '#c62828'] },
  { keywords: ['italian', 'emilian'], colors: ['#1b5e20', '#2e7d32'] },
  { keywords: ['korean'], colors: ['#4a148c', '#6a1b9a'] },
  { keywords: ['american', 'new american', 'farm-to-table'], colors: ['#e65100', '#f57c00'] },
  { keywords: ['scandinavian'], colors: ['#004d40', '#00695c'] },
  { keywords: ['mediterranean'], colors: ['#01579b', '#0277bd'] },
  { keywords: ['mexican'], colors: ['#bf360c', '#d84315'] },
  { keywords: ['seafood'], colors: ['#0d47a1', '#1565c0'] },
  { keywords: ['steakhouse'], colors: ['#3e2723', '#4e342e'] },
]

const DEFAULT_COLORS = ['#5d4037', '#795548']

function getGradient(cuisine) {
  if (!cuisine) return DEFAULT_COLORS
  const lower = cuisine.toLowerCase()
  for (const entry of CUISINE_COLORS) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.colors
    }
  }
  return DEFAULT_COLORS
}

const SIZES = { sm: 32, md: 48, lg: 64 }
const FONT_SIZES = { sm: 14, md: 20, lg: 28 }

export default function RestaurantThumbnail({ restaurant, size = 'md' }) {
  const [from, to] = getGradient(restaurant?.cuisine)
  const px = SIZES[size] || SIZES.md
  const fs = FONT_SIZES[size] || FONT_SIZES.md
  const letter = (restaurant?.name || '?')[0].toUpperCase()

  return (
    <div
      className={`restaurant-thumb restaurant-thumb--${size}`}
      style={{
        width: px,
        height: px,
        minWidth: px,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      <span className="restaurant-thumb__letter" style={{ fontSize: fs }}>
        {letter}
      </span>
    </div>
  )
}
