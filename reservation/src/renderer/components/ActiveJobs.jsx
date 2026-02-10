import React from 'react'

const STATUS_CLASS = {
  pending: 'status-badge--pending',
  monitoring: 'status-badge--monitoring',
  booked: 'status-badge--booked',
  failed: 'status-badge--failed',
  cancelled: 'status-badge--cancelled'
}

const PLATFORM_CLASS = {
  Resy: 'platform-badge--resy',
  Tock: 'platform-badge--tock',
  OpenTable: 'platform-badge--opentable'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCreated(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getCountdown(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffMs = target - now
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Past date'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays} days away`
}

export default function ActiveJobs({ jobs, onCancel, onNewJob, hasFilters }) {
  if (!jobs || jobs.length === 0) {
    if (hasFilters) {
      return (
        <div className="empty-state">
          <span className="empty-state__icon">🔍</span>
          <h3 className="empty-state__title">No matching jobs</h3>
          <p className="empty-state__description">
            No watch jobs match your current filters. Try adjusting your search or status filter.
          </p>
        </div>
      )
    }

    return (
      <div className="empty-state">
        <span className="empty-state__icon">◉</span>
        <h3 className="empty-state__title">No active watch jobs</h3>
        <p className="empty-state__description">
          Create a watch job to automatically monitor reservation availability and book when a slot opens up.
        </p>
        {onNewJob && (
          <button className="empty-state__cta wizard-btn wizard-btn--primary" onClick={onNewJob}>
            + New Watch Job
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="active-jobs-grid">
      {jobs.map(job => {
        let timeSlots = []
        try { timeSlots = JSON.parse(job.time_slots || '[]') } catch { /* ignore */ }
        const countdown = getCountdown(job.target_date)

        return (
          <div key={job.id} className={`job-card job-card--${job.status}`}>
            <div className="job-card__header">
              <h3 className="job-card__restaurant">{job.restaurant_name}</h3>
              <span className={`restaurant-card__platform ${PLATFORM_CLASS[job.restaurant_platform] || ''}`}>
                {job.restaurant_platform}
              </span>
            </div>

            <p className="job-card__date">{formatDate(job.target_date)}</p>
            {countdown && <span className="job-card__countdown">{countdown}</span>}

            <div className="job-card__slots">
              {timeSlots.map(slot => (
                <span key={slot} className="job-card__slot-badge">{slot}</span>
              ))}
            </div>

            <div className="job-card__details">
              <span className="job-card__party">Party of {job.party_size}</span>
              <span className={`status-badge ${STATUS_CLASS[job.status] || ''}`}>
                <span className={`status-dot status-dot--${job.status}`} />
                {job.status}
              </span>
            </div>

            <p className="job-card__created">Created {formatCreated(job.created_at)}</p>

            <div className="job-card__actions">
              <button
                className="job-card__cancel-btn"
                onClick={() => {
                  if (window.confirm(`Cancel watch job for ${job.restaurant_name}?`)) {
                    onCancel(job.id)
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
