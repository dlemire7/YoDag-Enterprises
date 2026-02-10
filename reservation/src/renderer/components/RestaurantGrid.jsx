import React from 'react'
import RestaurantCard from './RestaurantCard'

export default function RestaurantGrid({ restaurants, onQuickWatch }) {
  if (restaurants.length === 0) {
    return (
      <div className="restaurant-grid__empty">
        <p>No restaurants match your filters.</p>
      </div>
    )
  }

  return (
    <div className="restaurant-grid">
      {restaurants.map(r => (
        <RestaurantCard key={r.id} restaurant={r} onQuickWatch={onQuickWatch} />
      ))}
    </div>
  )
}
