import React, { useEffect, useState, useMemo } from 'react'
import { useIpc } from '../hooks/useIpc'
import MonitorStats from '../components/MonitorStats'
import ActiveJobs from '../components/ActiveJobs'
import BookingHistory from '../components/BookingHistory'
import WatchJobWizard from '../components/WatchJobWizard'

const TIME_SLOTS = [
  '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM',
  '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM',
  '9:00 PM', '9:30 PM', '10:00 PM', '10:30 PM'
]

function getTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function MonitorPage() {
  const { invoke } = useIpc()
  const [jobs, setJobs] = useState([])
  const [history, setHistory] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('jobs')
  const [wizardOpen, setWizardOpen] = useState(false)

  // Quick-create form state
  const [quickRestaurant, setQuickRestaurant] = useState('')
  const [quickDate, setQuickDate] = useState('')
  const [quickTime, setQuickTime] = useState('')
  const [quickPartySize, setQuickPartySize] = useState('')

  // Quick-create availability state
  const [quickAvailState, setQuickAvailState] = useState('idle')
  const [quickSlots, setQuickSlots] = useState([])
  const [quickAvailError, setQuickAvailError] = useState('')
  const [quickBookingSlot, setQuickBookingSlot] = useState(null)
  const [quickBookingResult, setQuickBookingResult] = useState(null)

  // Search & filter state
  const [jobSearch, setJobSearch] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('')
  const [historySortBy, setHistorySortBy] = useState('date-desc')

  const fetchData = async () => {
    const [jobRows, historyRows, restaurantRows] = await Promise.all([
      invoke('db:get-watch-jobs'),
      invoke('db:get-booking-history'),
      invoke('db:get-restaurants')
    ])
    setJobs(jobRows || [])
    setHistory(historyRows || [])
    setRestaurants(restaurantRows || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Listen for real-time job updates from the scheduler
  useEffect(() => {
    const cleanup = window.api.on('monitor:job-update', () => {
      fetchData()
    })
    return cleanup
  }, [])

  // Listen for keyboard shortcuts
  useEffect(() => {
    const handleOpenWizard = () => setWizardOpen(true)
    const handleFocusSearch = () => {
      const input = document.querySelector('.search-bar__input')
      if (input) input.focus()
    }
    const handleCloseModal = () => setWizardOpen(false)

    window.addEventListener('app:open-wizard', handleOpenWizard)
    window.addEventListener('app:focus-search', handleFocusSearch)
    window.addEventListener('app:close-modal', handleCloseModal)
    return () => {
      window.removeEventListener('app:open-wizard', handleOpenWizard)
      window.removeEventListener('app:focus-search', handleFocusSearch)
      window.removeEventListener('app:close-modal', handleCloseModal)
    }
  }, [])

  const handleCancel = async (id) => {
    await invoke('db:delete-watch-job', id)
    const updated = await invoke('db:get-watch-jobs')
    setJobs(updated || [])
  }

  const handleCreated = async () => {
    const updated = await invoke('db:get-watch-jobs')
    setJobs(updated || [])
  }

  const handleQuickCreate = async () => {
    const restaurant = restaurants.find(r => String(r.id) === quickRestaurant)
    if (!restaurant) return
    await invoke('db:create-watch-job', {
      restaurant_id: restaurant.id,
      target_date: quickDate,
      time_slots: [quickTime],
      party_size: parseInt(quickPartySize, 10),
      priority: 'normal'
    })
    setQuickRestaurant('')
    setQuickDate('')
    setQuickTime('')
    setQuickPartySize('')
    const updated = await invoke('db:get-watch-jobs')
    setJobs(updated || [])
  }

  const quickCreateReady = quickRestaurant && quickDate && quickTime && quickPartySize && quickDate >= getTomorrow()

  const quickCheckReady = quickRestaurant && quickDate && quickPartySize && quickDate >= getTomorrow()
  const selectedQuickRestaurant = restaurants.find(r => String(r.id) === quickRestaurant)
  const canCheckQuick = selectedQuickRestaurant?.platform === 'Resy' || selectedQuickRestaurant?.platform === 'Tock'

  // Reset quick availability when inputs change
  useEffect(() => {
    setQuickAvailState('idle')
    setQuickSlots([])
    setQuickAvailError('')
    setQuickBookingSlot(null)
    setQuickBookingResult(null)
  }, [quickRestaurant, quickDate, quickPartySize])

  const handleQuickCheckAvailability = async () => {
    if (!selectedQuickRestaurant) return
    setQuickAvailState('loading')
    setQuickSlots([])
    setQuickAvailError('')
    setQuickBookingResult(null)
    try {
      const platform = selectedQuickRestaurant.platform
      const channel = platform === 'Tock' ? 'tock:check-availability' : 'resy:check-availability'
      const result = await invoke(channel, {
        restaurant_id: selectedQuickRestaurant.id,
        date: quickDate,
        party_size: parseInt(quickPartySize, 10)
      })
      if (result.noCredentials) {
        setQuickAvailState('error')
        setQuickAvailError(`Not signed into ${platform} — go to Settings to sign in`)
        return
      }
      if (result.success) {
        setQuickSlots(result.slots || [])
        setQuickAvailState('loaded')
      } else {
        setQuickAvailState('error')
        setQuickAvailError(result.error || 'Failed to check availability')
      }
    } catch (err) {
      setQuickAvailState('error')
      setQuickAvailError(err.message || 'Failed to check availability')
    }
  }

  const handleQuickBookNow = async (slot) => {
    setQuickBookingSlot(slot.config_id)
    setQuickBookingResult(null)
    try {
      const platform = selectedQuickRestaurant.platform
      const channel = platform === 'Tock' ? 'tock:book-now' : 'resy:book-now'
      const result = await invoke(channel, {
        restaurant_id: selectedQuickRestaurant.id,
        config_id: slot.config_id,
        date: quickDate,
        party_size: parseInt(quickPartySize, 10),
        time: slot.time
      })
      if (result.success && result.opened_in_browser) {
        setQuickBookingResult({
          success: true,
          message: result.message || 'Booking page opened in your browser. Complete the reservation there.'
        })
        fetchData()
      } else {
        setQuickBookingResult(result)
        if (result.success) {
          fetchData()
          setTimeout(() => {
            setQuickRestaurant('')
            setQuickDate('')
            setQuickTime('')
            setQuickPartySize('')
          }, 3000)
        }
      }
    } catch (err) {
      setQuickBookingResult({ success: false, error: err.message || 'Booking failed' })
    } finally {
      setQuickBookingSlot(null)
    }
  }

  // Filtered jobs (exclude cancelled, apply search + status filter)
  const filteredJobs = useMemo(() => {
    let result = (jobs || []).filter(j => j.status !== 'cancelled')

    if (jobSearch) {
      const q = jobSearch.toLowerCase()
      result = result.filter(j =>
        j.restaurant_name && j.restaurant_name.toLowerCase().includes(q)
      )
    }

    if (jobStatusFilter) {
      result = result.filter(j => j.status === jobStatusFilter)
    }

    return result
  }, [jobs, jobSearch, jobStatusFilter])

  // Filtered & sorted history
  const filteredHistory = useMemo(() => {
    let result = [...(history || [])]

    if (historySearch) {
      const q = historySearch.toLowerCase()
      result = result.filter(h =>
        h.restaurant && h.restaurant.toLowerCase().includes(q)
      )
    }

    if (historyStatusFilter) {
      result = result.filter(h => h.status === historyStatusFilter)
    }

    if (historySortBy === 'date-desc') {
      result.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    } else if (historySortBy === 'date-asc') {
      result.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    } else if (historySortBy === 'restaurant-asc') {
      result.sort((a, b) => (a.restaurant || '').localeCompare(b.restaurant || ''))
    } else if (historySortBy === 'restaurant-desc') {
      result.sort((a, b) => (b.restaurant || '').localeCompare(a.restaurant || ''))
    }

    return result
  }, [history, historySearch, historyStatusFilter, historySortBy])

  const activeJobCount = (jobs || []).filter(j => j.status !== 'cancelled').length
  const hasJobFilters = !!(jobSearch || jobStatusFilter)
  const hasHistoryFilters = !!(historySearch || historyStatusFilter)

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Monitor & Book</h2>
          <p className="page-subtitle">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__row">
          <div>
            <h2 className="page-title">Monitor & Book</h2>
            <p className="page-subtitle">Active watch jobs and booking history</p>
          </div>
          <button className="wizard-btn wizard-btn--primary" onClick={() => setWizardOpen(true)}>
            + New Watch Job
          </button>
        </div>
      </div>

      <MonitorStats jobs={jobs} history={history} />

      <div className="quick-create">
        <span className="quick-create__label">Quick Watch</span>
        <div className="quick-create__fields">
          <select
            className="search-bar__select"
            value={quickRestaurant}
            onChange={e => setQuickRestaurant(e.target.value)}
          >
            <option value="">Select Restaurant</option>
            {restaurants.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <input
            className="search-bar__input quick-create__date"
            type="date"
            min={getTomorrow()}
            value={quickDate}
            onChange={e => setQuickDate(e.target.value)}
          />
          <select
            className="search-bar__select"
            value={quickTime}
            onChange={e => setQuickTime(e.target.value)}
          >
            <option value="">Select Time</option>
            {TIME_SLOTS.map(slot => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
          <select
            className="search-bar__select"
            value={quickPartySize}
            onChange={e => setQuickPartySize(e.target.value)}
          >
            <option value="">Party Size</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
            ))}
          </select>
          <button
            className="wizard-btn wizard-btn--primary quick-create__btn"
            disabled={!quickCreateReady}
            onClick={handleQuickCreate}
          >
            Quick Watch
          </button>
          {canCheckQuick && (
            <button
              className="wizard-btn wizard-btn--secondary quick-create__btn"
              disabled={!quickCheckReady || quickAvailState === 'loading'}
              onClick={handleQuickCheckAvailability}
            >
              {quickAvailState === 'loading' ? 'Checking...' : 'Check Now'}
            </button>
          )}
        </div>

        {/* Inline availability results */}
        {canCheckQuick && quickAvailState === 'loading' && (
          <div className="availability-section__loading">
            <div className="credential-signing-spinner" />
            <span>Checking availability...</span>
          </div>
        )}

        {canCheckQuick && quickAvailState === 'error' && (
          <div className="availability-section__error">
            <span>{quickAvailError}</span>
            <button
              className="wizard-btn wizard-btn--secondary"
              onClick={handleQuickCheckAvailability}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {canCheckQuick && quickAvailState === 'loaded' && quickSlots.length === 0 && (
          <div className="availability-section__empty">
            No slots currently available. Create a watch job to monitor for openings.
          </div>
        )}

        {canCheckQuick && quickAvailState === 'loaded' && quickSlots.length > 0 && (
          <div className="availability-slots__grid">
            {quickSlots.map((slot) => (
              <div key={slot.config_id} className="availability-slot">
                <span className="availability-slot__time">{slot.time}</span>
                {slot.type && <span className="availability-slot__type">{slot.type}</span>}
                <button
                  className="availability-slot__book-btn"
                  disabled={!!quickBookingSlot}
                  onClick={() => handleQuickBookNow(slot)}
                >
                  {quickBookingSlot === slot.config_id ? 'Booking...' : 'Book Now'}
                </button>
              </div>
            ))}
          </div>
        )}

        {canCheckQuick && quickBookingResult && !quickBookingResult.success && (
          <div className="availability-section__booking-error">
            <span>{quickBookingResult.error}</span>
            {quickBookingResult.conflict && (
              <button
                className="wizard-btn wizard-btn--secondary"
                onClick={handleQuickCheckAvailability}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                Refresh Slots
              </button>
            )}
          </div>
        )}

        {canCheckQuick && quickBookingResult?.success && (
          <div className="availability-section__booking-success">
            {quickBookingResult.message
              ? quickBookingResult.message
              : <>Booked! {quickBookingResult.confirmation_code && <>Confirmation: <strong>{quickBookingResult.confirmation_code}</strong></>}</>
            }
          </div>
        )}
      </div>

      <div className="tab-bar tab-bar--enhanced">
        <button
          className={`tab-bar__tab${activeTab === 'jobs' ? ' tab-bar__tab--active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Active Jobs
          {activeJobCount > 0 && <span className="tab-bar__count">{activeJobCount}</span>}
        </button>
        <button
          className={`tab-bar__tab${activeTab === 'history' ? ' tab-bar__tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Booking History
          {history.length > 0 && <span className="tab-bar__count">{history.length}</span>}
        </button>
      </div>

      {activeTab === 'jobs' && (
        <>
          {activeJobCount > 0 && (
            <div className="search-bar">
              <div className="search-bar__input-wrapper">
                <input
                  className="search-bar__input"
                  type="text"
                  placeholder="Search jobs by restaurant..."
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                />
                {jobSearch && (
                  <button className="search-bar__clear" onClick={() => setJobSearch('')}>×</button>
                )}
              </div>
              <div className="search-bar__filters">
                <select
                  className="search-bar__select"
                  value={jobStatusFilter}
                  onChange={e => setJobStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="booked">Booked</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <span className="search-bar__count">
                {filteredJobs.length} of {activeJobCount} jobs
              </span>
            </div>
          )}
          <ActiveJobs
            jobs={filteredJobs}
            onCancel={handleCancel}
            onNewJob={() => setWizardOpen(true)}
            hasFilters={hasJobFilters}
          />
        </>
      )}

      {activeTab === 'history' && (
        <>
          {history.length > 0 && (
            <div className="search-bar">
              <div className="search-bar__input-wrapper">
                <input
                  className="search-bar__input"
                  type="text"
                  placeholder="Search history by restaurant..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                />
                {historySearch && (
                  <button className="search-bar__clear" onClick={() => setHistorySearch('')}>×</button>
                )}
              </div>
              <div className="search-bar__filters">
                <select
                  className="search-bar__select"
                  value={historyStatusFilter}
                  onChange={e => setHistoryStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="attempted">Attempted</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <span className="search-bar__count">
                {filteredHistory.length} of {history.length} entries
              </span>
            </div>
          )}
          <BookingHistory
            history={filteredHistory}
            sortBy={historySortBy}
            onSortChange={setHistorySortBy}
          />
        </>
      )}

      <WatchJobWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleCreated}
        restaurants={restaurants}
        preselectedRestaurant={null}
      />
    </div>
  )
}
