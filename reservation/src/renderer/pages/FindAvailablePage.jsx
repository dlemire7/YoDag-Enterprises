import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useIpc } from '../hooks/useIpc'
import Badge from '../components/Badge'

const STAR_LABELS = { 3: '\u2605\u2605\u2605 Three Stars', 2: '\u2605\u2605 Two Stars', 1: '\u2605 One Star' }

const BELI_LIST_STYLES = {
  'Top 50 NYC Restaurants':        { backgroundColor: '#fff3e0', color: '#e65100' },
  '44 Great Women-Led NYC Spots':  { backgroundColor: '#f3e5f5', color: '#7b1fa2' },
  '34 Great Black-Owned NYC Spots':{ backgroundColor: '#e8f5e9', color: '#2e7d32' },
  'Top 25 NYC Hidden Gems':        { backgroundColor: '#e0f2f1', color: '#00695c' },
  'Top 20 NYC Mexican':            { backgroundColor: '#ffebee', color: '#c62828' },
  'Top 10 NYC Sandwich Shops':     { backgroundColor: '#efebe9', color: '#4e342e' },
  'Top 10 NYC Date Night':         { backgroundColor: '#fce4ec', color: '#ad1457' },
  'Top 10 NYC French':             { backgroundColor: '#e3f2fd', color: '#0d47a1' },
  'Top NYC Pizza':                 { backgroundColor: '#fbe9e7', color: '#bf360c' },
}

const TIME_OPTIONS = []
for (let h = 11; h <= 23; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour12 = h > 12 ? h - 12 : h
    const ampm = h >= 12 ? 'PM' : 'AM'
    const label = `${hour12}:${m === 0 ? '00' : '30'} ${ampm}`
    const value = `${h}:${m === 0 ? '00' : '30'}`
    TIME_OPTIONS.push({ label, value })
  }
}

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function slotTimeToMinutes(displayTime) {
  // Parse "6:30 PM" or "18:30" format
  const match24 = displayTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24) {
    return parseInt(match24[1]) * 60 + parseInt(match24[2])
  }
  const match12 = displayTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match12) {
    let h = parseInt(match12[1])
    const m = parseInt(match12[2])
    const period = match12[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  return -1
}

function platformColor(platform) {
  if (platform === 'Resy') return '#e84141'
  if (platform === 'Tock') return '#9333ea'
  return '#888'
}

export default function FindAvailablePage() {
  const { invoke, send, on } = useIpc()

  // Form state
  const [date, setDate] = useState(getToday())
  const [timeStart, setTimeStart] = useState('17:00')
  const [timeEnd, setTimeEnd] = useState('21:00')
  const [partySize, setPartySize] = useState(2)

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [showAll, setShowAll] = useState(false)

  // Booking state
  const [bookingSlot, setBookingSlot] = useState(null) // { restaurantId, slot }
  const [bookingResult, setBookingResult] = useState(null) // { restaurantId, slotKey, success, message }

  // Credential status from startup validation
  const [credWarnings, setCredWarnings] = useState([])

  const resultsRef = useRef([])

  // Listen for credential status updates
  useEffect(() => {
    const unsub = on('credentials:status-update', ({ platform, valid, reason }) => {
      if (!valid && reason !== 'Not configured') {
        setCredWarnings(prev => {
          const filtered = prev.filter(w => w.platform !== platform)
          return [...filtered, { platform, reason }]
        })
      } else {
        setCredWarnings(prev => prev.filter(w => w.platform !== platform))
      }
    })
    return () => { if (unsub) unsub() }
  }, [])

  // Listen for streaming results
  useEffect(() => {
    const unsubResult = on('find:result', (data) => {
      resultsRef.current = [...resultsRef.current, data]
      setResults([...resultsRef.current])
    })
    const unsubProgress = on('find:progress', (data) => {
      setProgress(data)
    })
    return () => {
      if (unsubResult) unsubResult()
      if (unsubProgress) unsubProgress()
    }
  }, [])

  const handleSearch = async () => {
    setScanning(true)
    setResults([])
    setSummary(null)
    setProgress({ checked: 0, total: 0, currentName: 'Starting...' })
    setBookingSlot(null)
    setBookingResult(null)
    resultsRef.current = []

    try {
      const result = await invoke('find:search-available', { date, time_start: timeStart, time_end: timeEnd, party_size: partySize })
      setSummary(result)
    } catch (err) {
      setSummary({ error: err.message || 'Search failed' })
    }
    setScanning(false)
  }

  const handleCancel = () => {
    send('find:cancel')
    setScanning(false)
  }

  const handleBookNow = async (restaurant, slot) => {
    const slotKey = `${restaurant.id}-${slot.time || slot.config_id}`
    setBookingSlot(slotKey)
    setBookingResult(null)

    try {
      const channel = restaurant.platform === 'Tock' ? 'tock:book-now' : 'resy:book-now'
      const params = restaurant.platform === 'Tock'
        ? { restaurant_id: restaurant.id, date, party_size: partySize, time: slot.time }
        : { restaurant_id: restaurant.id, config_id: slot.config_id, date, party_size: partySize, time: slot.time }

      const result = await invoke(channel, params)

      if (result.success) {
        const message = restaurant.platform === 'Tock'
          ? 'Booking page opened in your browser'
          : `Booked! Confirmation: ${result.confirmation_code || 'pending'}`
        setBookingResult({ slotKey, success: true, message })
      } else {
        setBookingResult({ slotKey, success: false, message: result.error || 'Booking failed' })
      }
    } catch (err) {
      setBookingResult({ slotKey, success: false, message: err.message || 'Booking failed' })
    }
    setBookingSlot(null)
  }

  // Partition results into matching/other/errors
  const startMin = timeToMinutes(timeStart)
  const endMin = timeToMinutes(timeEnd)

  const categorized = results.map(r => {
    if (r.error) {
      return { ...r, matching: [], other: [], hasError: true }
    }
    const matching = (r.slots || []).filter(s => {
      const m = slotTimeToMinutes(s.time)
      return m >= startMin && m <= endMin
    })
    const other = (r.slots || []).filter(s => {
      const m = slotTimeToMinutes(s.time)
      return m < startMin || m > endMin
    })
    return { ...r, matching, other, hasError: false }
  })

  const withMatching = categorized.filter(r => r.matching.length > 0)
  const withOtherOnly = categorized.filter(r => !r.hasError && r.matching.length === 0 && r.other.length > 0)
  const noAvailability = categorized.filter(r => !r.hasError && r.matching.length === 0 && r.other.length === 0)
  const errorResults = categorized.filter(r => r.hasError)

  const hasAnyResults = results.length > 0

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Find Available</h2>
        <p className="page-subtitle">Scan all bookable restaurants for a date & time</p>
      </div>

      {/* Credential warnings */}
      {credWarnings.length > 0 && (
        <div className="find-warning">
          {credWarnings.map(w => (
            <div key={w.platform}>
              {w.platform} session expired — sign in on Settings to include {w.platform} restaurants
            </div>
          ))}
        </div>
      )}

      {/* Search Form */}
      <div className="find-form">
        <div className="find-form__field">
          <label className="find-form__label">Date</label>
          <input
            type="date"
            className="wizard-input find-form__date"
            value={date}
            min={getToday()}
            onChange={e => setDate(e.target.value)}
            disabled={scanning}
          />
        </div>
        <div className="find-form__field">
          <label className="find-form__label">From</label>
          <select
            className="search-bar__select"
            value={timeStart}
            onChange={e => setTimeStart(e.target.value)}
            disabled={scanning}
          >
            {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="find-form__field">
          <label className="find-form__label">To</label>
          <select
            className="search-bar__select"
            value={timeEnd}
            onChange={e => setTimeEnd(e.target.value)}
            disabled={scanning}
          >
            {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="find-form__field">
          <label className="find-form__label">Party</label>
          <select
            className="search-bar__select"
            value={partySize}
            onChange={e => setPartySize(Number(e.target.value))}
            disabled={scanning}
          >
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="find-form__actions">
          {!scanning ? (
            <button className="wizard-btn wizard-btn--primary" onClick={handleSearch} disabled={!date}>
              Search
            </button>
          ) : (
            <button className="wizard-btn find-form__cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Skipped platforms warning */}
      {summary?.skippedPlatforms?.length > 0 && (
        <div className="find-warning">
          Sign into {summary.skippedPlatforms.join(' and ')} on Settings to search those restaurants.
        </div>
      )}

      {/* Progress */}
      {scanning && progress && (
        <div className="find-progress">
          <div className="find-progress__bar">
            <div
              className="find-progress__fill"
              style={{ width: `${progress.total > 0 ? (progress.checked / progress.total * 100) : 0}%` }}
            />
          </div>
          <span className="find-progress__text">
            Checking {progress.currentName}... ({progress.checked} of {progress.total})
          </span>
        </div>
      )}

      {/* Summary */}
      {!scanning && summary && !summary.error && (
        <div className="find-summary">
          Checked {summary.checked} restaurants — {summary.withAvailability} with availability
          {summary.errors > 0 && `, ${summary.errors} errors`}
        </div>
      )}
      {!scanning && summary?.error && (
        <div className="find-error-banner">{summary.error}</div>
      )}

      {/* Empty state */}
      {!scanning && !hasAnyResults && !summary && (
        <div className="empty-state">
          <div className="empty-state__icon">{'\u25CE'}</div>
          <h3 className="empty-state__title">Pick a date and time to find available restaurants</h3>
          <p className="empty-state__description">
            We'll check all Resy and Tock restaurants and show you what's open.
          </p>
        </div>
      )}

      {/* No results found */}
      {!scanning && hasAnyResults && withMatching.length === 0 && withOtherOnly.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">{'\u2715'}</div>
          <h3 className="empty-state__title">No availability found</h3>
          <p className="empty-state__description">
            No restaurants have open slots for {date} between {TIME_OPTIONS.find(o => o.value === timeStart)?.label} and {TIME_OPTIONS.find(o => o.value === timeEnd)?.label}. Try a different date or create watch jobs.
          </p>
        </div>
      )}

      {/* Results — matching time range */}
      {withMatching.length > 0 && (
        <div className="find-results">
          <h3 className="find-results__heading">
            Available ({withMatching.length})
          </h3>
          {withMatching.map(r => (
            <ResultCard
              key={r.restaurant.id}
              result={r}
              date={date}
              partySize={partySize}
              bookingSlot={bookingSlot}
              bookingResult={bookingResult}
              onBook={handleBookNow}
              showOther
            />
          ))}
        </div>
      )}

      {/* Results — other times only */}
      {withOtherOnly.length > 0 && (
        <div className="find-results">
          <h3 className="find-results__heading find-results__heading--secondary">
            Available at other times ({withOtherOnly.length})
          </h3>
          {withOtherOnly.map(r => (
            <ResultCard
              key={r.restaurant.id}
              result={r}
              date={date}
              partySize={partySize}
              bookingSlot={bookingSlot}
              bookingResult={bookingResult}
              onBook={handleBookNow}
              showOther
              dimmed
            />
          ))}
        </div>
      )}

      {/* Errors */}
      {errorResults.length > 0 && (
        <div className="find-results">
          <button
            className="find-results__toggle"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Hide' : 'Show'} {errorResults.length} error{errorResults.length !== 1 ? 's' : ''}
          </button>
          {showAll && errorResults.map(r => (
            <div key={r.restaurant.id} className="find-result-card find-result-card--error">
              <div className="find-result-card__info">
                <span className="find-result-card__name">{r.restaurant.name}</span>
                <span className="find-result-card__platform" style={{ color: platformColor(r.restaurant.platform) }}>
                  {r.restaurant.platform}
                </span>
              </div>
              <span className="find-result-card__error-text">{r.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultCard({ result, date, partySize, bookingSlot, bookingResult, onBook, showOther, dimmed }) {
  const [otherExpanded, setOtherExpanded] = useState(false)
  const { restaurant, matching, other } = result

  let criteriaList = []
  try { criteriaList = JSON.parse(restaurant.criteria || '[]') } catch { /* ignore */ }

  let beliLists = []
  try { beliLists = JSON.parse(restaurant.beli_lists || '[]') } catch { /* ignore */ }

  return (
    <div className={`find-result-card ${dimmed ? 'find-result-card--dimmed' : ''}`}>
      <div className="find-result-card__left">
        {restaurant.google_url ? (
          <a href={restaurant.google_url} target="_blank" rel="noopener noreferrer" className="find-result-card__image-link" title="View on Google">
            {restaurant.image_url ? (
              <img className="find-result-card__image" src={restaurant.image_url} alt="" />
            ) : (
              <div className="find-result-card__placeholder">{restaurant.name[0]}</div>
            )}
          </a>
        ) : restaurant.image_url ? (
          <img className="find-result-card__image" src={restaurant.image_url} alt="" />
        ) : (
          <div className="find-result-card__placeholder">{restaurant.name[0]}</div>
        )}
        <div className="find-result-card__info">
          <span className="find-result-card__name">{restaurant.name}</span>
          <span className="find-result-card__meta">
            {[restaurant.neighborhood, restaurant.cuisine].filter(Boolean).join(' · ')}
            {restaurant.google_rating && (
              <span className="find-result-card__rating">{'\u2605'} {restaurant.google_rating.toFixed(1)}</span>
            )}
          </span>
          <div className="find-result-card__badges">
            <span className="find-result-card__platform" style={{ color: platformColor(restaurant.platform) }}>
              {restaurant.platform}
            </span>
            {criteriaList.filter(c => c !== 'beli' && !c.startsWith('Beli:')).map(c => (
              <Badge key={c} type={c}>
                {c === 'michelin' && restaurant.stars > 0 ? STAR_LABELS[restaurant.stars] || 'Michelin' : c === 'google' ? 'Google 4.8+' : c === 'eater' ? 'Eater Essential' : c}
              </Badge>
            ))}
            {beliLists.map(b => (
              <span
                key={b.list}
                className="badge"
                style={BELI_LIST_STYLES[b.list] || { backgroundColor: '#e0f2f1', color: '#00897b' }}
              >
                {b.rank ? `${b.list} #${b.rank}` : b.list}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="find-result-card__slots">
        {matching.map((slot, i) => {
          const slotKey = `${restaurant.id}-${slot.time || slot.config_id}`
          const isBooking = bookingSlot === slotKey
          const result = bookingResult?.slotKey === slotKey ? bookingResult : null
          return (
            <SlotPill
              key={i}
              slot={slot}
              isBooking={isBooking}
              result={result}
              onBook={() => onBook(restaurant, slot)}
            />
          )
        })}
        {other.length > 0 && (
          <>
            <button
              className="find-result-card__other-toggle"
              onClick={() => setOtherExpanded(v => !v)}
            >
              {otherExpanded ? 'Hide' : `+${other.length} other time${other.length !== 1 ? 's' : ''}`}
            </button>
            {otherExpanded && other.map((slot, i) => {
              const slotKey = `${restaurant.id}-${slot.time || slot.config_id}`
              const isBooking = bookingSlot === slotKey
              const res = bookingResult?.slotKey === slotKey ? bookingResult : null
              return (
                <SlotPill
                  key={`other-${i}`}
                  slot={slot}
                  isBooking={isBooking}
                  result={res}
                  onBook={() => onBook(restaurant, slot)}
                  secondary
                />
              )
            })}
          </>
        )}
        {matching.length === 0 && other.length === 0 && !result.hasError && (
          <span className="find-result-card__no-slots">No availability</span>
        )}
      </div>
    </div>
  )
}

function SlotPill({ slot, isBooking, result, onBook, secondary }) {
  if (result?.success) {
    return (
      <span className="find-slot-pill find-slot-pill--success">
        {slot.time} — {result.message}
      </span>
    )
  }
  if (result && !result.success) {
    return (
      <span className="find-slot-pill find-slot-pill--error">
        {slot.time} — {result.message}
      </span>
    )
  }

  return (
    <button
      className={`find-slot-pill ${secondary ? 'find-slot-pill--secondary' : ''}`}
      onClick={onBook}
      disabled={isBooking}
    >
      {isBooking ? `${slot.time}...` : slot.time}
      {!isBooking && <span className="find-slot-pill__action">Book Now</span>}
    </button>
  )
}
