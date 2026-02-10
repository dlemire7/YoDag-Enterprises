import React from 'react'

export default function MonitorStats({ jobs, history }) {
  const activeJobs = (jobs || []).filter(j => j.status === 'pending' || j.status === 'monitoring').length
  const bookingsMade = (history || []).filter(h => h.status === 'success').length
  const failedJobs = (jobs || []).filter(j => j.status === 'failed').length
  const totalHistory = (history || []).length
  const successRate = totalHistory > 0
    ? Math.round((bookingsMade / totalHistory) * 100) + '%'
    : '--'

  return (
    <div className="stats-dashboard">
      <div className="stats-card">
        <span className="stats-icon">◉</span>
        <span className="stats-value">{activeJobs}</span>
        <span className="stats-label">Active Jobs</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">✓</span>
        <span className="stats-value">{bookingsMade}</span>
        <span className="stats-label">Bookings Made</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">✕</span>
        <span className="stats-value">{failedJobs}</span>
        <span className="stats-label">Failed</span>
      </div>
      <div className="stats-card">
        <span className="stats-icon">%</span>
        <span className="stats-value">{successRate}</span>
        <span className="stats-label">Success Rate</span>
      </div>
    </div>
  )
}
