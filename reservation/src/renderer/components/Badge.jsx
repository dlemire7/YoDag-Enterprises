import React from 'react'

const BADGE_TYPES = {
  michelin: 'badge--michelin',
  google: 'badge--google',
  eater: 'badge--eater'
}

export default function Badge({ type, children }) {
  return (
    <span className={`badge ${BADGE_TYPES[type] || ''}`}>
      {children}
    </span>
  )
}
