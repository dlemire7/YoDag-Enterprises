import React, { useState } from 'react'
import Badge from './Badge'

const STAR_LABELS = { 3: '\u2605\u2605\u2605 Three Stars', 2: '\u2605\u2605 Two Stars', 1: '\u2605 One Star' }

const PLATFORM_CLASS = {
  Resy: 'platform-badge--resy',
  Tock: 'platform-badge--tock',
  OpenTable: 'platform-badge--opentable'
}

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

export default function RestaurantCard({ restaurant, onQuickWatch }) {
  const { name, neighborhood, borough, cuisine, stars, criteria, platform, url, image_url } = restaurant
  const [imgFailed, setImgFailed] = useState(false)

  let criteriaList = []
  try { criteriaList = JSON.parse(criteria || '[]') } catch { /* ignore */ }

  const showImage = image_url && !imgFailed
  const [from, to] = getGradient(cuisine)
  const letter = (name || '?')[0].toUpperCase()

  return (
    <div className="restaurant-card">
      <div className="restaurant-card__photo">
        {showImage ? (
          <img
            src={image_url}
            alt={name}
            onError={() => setImgFailed(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="restaurant-card__photo-placeholder"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <span className="restaurant-card__photo-placeholder-letter">{letter}</span>
          </div>
        )}
      </div>

      <div className="restaurant-card__header">
        <h3 className="restaurant-card__name">
          <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
        </h3>
        <p className="restaurant-card__meta">
          {neighborhood}, {borough} &middot; {cuisine}
        </p>
        <div className="restaurant-card__badges">
          <span className={`restaurant-card__platform ${PLATFORM_CLASS[platform] || ''}`}>
            {platform}
          </span>
          {criteriaList.map(c => (
            <Badge key={c} type={c}>
              {c === 'michelin' && stars > 0 ? STAR_LABELS[stars] || 'Michelin' : c === 'google' ? 'Google 4.8+' : c === 'eater' ? 'Eater Essential' : c}
            </Badge>
          ))}
        </div>
      </div>

      <div className="restaurant-card__footer">
        {onQuickWatch && (
          <button
            className="restaurant-card__quick-watch"
            onClick={() => onQuickWatch(restaurant)}
          >
            Watch
          </button>
        )}
      </div>
    </div>
  )
}
