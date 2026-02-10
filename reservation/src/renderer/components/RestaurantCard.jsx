import React from 'react'
import Badge from './Badge'
import RestaurantThumbnail from './RestaurantThumbnail'

const STAR_LABELS = { 3: '★★★ Three Stars', 2: '★★ Two Stars', 1: '★ One Star' }

const PLATFORM_CLASS = {
  Resy: 'platform-badge--resy',
  Tock: 'platform-badge--tock',
  OpenTable: 'platform-badge--opentable'
}

export default function RestaurantCard({ restaurant, onQuickWatch }) {
  const { name, neighborhood, borough, cuisine, stars, criteria, platform, reservation_release, url } = restaurant

  let criteriaList = []
  try { criteriaList = JSON.parse(criteria || '[]') } catch { /* ignore */ }

  return (
    <div className="restaurant-card">
      <div className="restaurant-card__header">
        <RestaurantThumbnail restaurant={restaurant} size="md" />
        <div className="restaurant-card__header-info">
          <div className="restaurant-card__header-top">
            <h3 className="restaurant-card__name">{name}</h3>
            <span className={`restaurant-card__platform ${PLATFORM_CLASS[platform] || ''}`}>
              {platform}
            </span>
          </div>
          <p className="restaurant-card__meta">
            {neighborhood}, {borough} &middot; {cuisine}
          </p>
          <div className="restaurant-card__badges">
            {criteriaList.map(c => (
              <Badge key={c} type={c}>
                {c === 'michelin' && stars > 0 ? STAR_LABELS[stars] || 'Michelin' : c === 'google' ? 'Google 4.8+' : c === 'eater' ? 'Eater Essential' : c}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {reservation_release && (
        <p className="restaurant-card__release">
          Release: {reservation_release}
        </p>
      )}

      <div className="restaurant-card__footer">
        <a
          className="restaurant-card__book-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Book Now
        </a>
        {onQuickWatch && (
          <button
            className="restaurant-card__quick-watch"
            onClick={() => onQuickWatch(restaurant)}
          >
            Quick Watch
          </button>
        )}
      </div>
    </div>
  )
}
