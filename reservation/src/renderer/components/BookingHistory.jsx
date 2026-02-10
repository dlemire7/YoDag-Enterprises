import React from 'react'

const STATUS_CLASS = {
  success: 'status-badge--booked',
  failed: 'status-badge--failed',
  cancelled: 'status-badge--cancelled',
  attempted: 'status-badge--pending'
}

const STATUS_DOT = {
  success: 'status-dot--booked',
  failed: 'status-dot--failed',
  cancelled: '',
  attempted: 'status-dot--pending'
}

function SortArrow({ column, sortBy }) {
  const isAsc = sortBy === `${column}-asc`
  const isDesc = sortBy === `${column}-desc`
  return (
    <span className="history-table__sort-arrow">
      {isAsc ? ' ▲' : isDesc ? ' ▼' : ' ⇅'}
    </span>
  )
}

export default function BookingHistory({ history, sortBy, onSortChange }) {
  if (!history || history.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon">📋</span>
        <h3 className="empty-state__title">No booking history</h3>
        <p className="empty-state__description">
          When watch jobs find and book reservations, they'll appear here with confirmation details.
        </p>
      </div>
    )
  }

  const handleSort = (column) => {
    if (!onSortChange) return
    const isAsc = sortBy === `${column}-asc`
    onSortChange(isAsc ? `${column}-desc` : `${column}-asc`)
  }

  return (
    <div className="history-table-wrapper">
      <table className="history-table">
        <thead>
          <tr>
            <th
              className="history-table__sortable"
              onClick={() => handleSort('restaurant')}
            >
              Restaurant
              <SortArrow column="restaurant" sortBy={sortBy} />
            </th>
            <th
              className="history-table__sortable"
              onClick={() => handleSort('date')}
            >
              Date
              <SortArrow column="date" sortBy={sortBy} />
            </th>
            <th>Time</th>
            <th>Party Size</th>
            <th>Platform</th>
            <th>Status</th>
            <th>Confirmation</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {history.map(row => (
            <tr key={row.id}>
              <td>{row.restaurant}</td>
              <td>{row.date}</td>
              <td>{row.time}</td>
              <td>{row.party_size}</td>
              <td>{row.platform}</td>
              <td>
                <span className={`status-badge ${STATUS_CLASS[row.status] || ''}`}>
                  <span className={`status-dot ${STATUS_DOT[row.status] || ''}`} />
                  {row.status}
                </span>
              </td>
              <td>{row.confirmation_code || '—'}</td>
              <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
