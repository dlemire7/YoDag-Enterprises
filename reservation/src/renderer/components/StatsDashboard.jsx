import React from 'react'

export default function StatsDashboard({ restaurants }) {
  const total = restaurants.length
  const michelinStarred = restaurants.filter(r => r.stars > 0).length
  const threeStar = restaurants.filter(r => r.stars === 3).length
  const brooklyn = restaurants.filter(r => r.borough === 'Brooklyn').length

  return (
    <div className="stats-dashboard">
      <div className="stats-card">
        <span className="stats-icon">✦</span>
        <span className="stats-value">{total}</span>
        <span className="stats-label">Total Restaurants</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">★</span>
        <span className="stats-value">{michelinStarred}</span>
        <span className="stats-label">Michelin Starred</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">★★★</span>
        <span className="stats-value">{threeStar}</span>
        <span className="stats-label">Three Star</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">⬡</span>
        <span className="stats-value">{brooklyn}</span>
        <span className="stats-label">Brooklyn</span>
      </div>
    </div>
  )
}
