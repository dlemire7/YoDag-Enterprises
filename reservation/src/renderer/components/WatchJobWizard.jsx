import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useIpc } from '../hooks/useIpc'
import WizardStepIndicator from './WizardStepIndicator'
import RestaurantThumbnail from './RestaurantThumbnail'

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

export default function WatchJobWizard({ isOpen, onClose, onCreated, restaurants, preselectedRestaurant }) {
  const { invoke } = useIpc()

  const skipStep1 = !!preselectedRestaurant

  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [restaurantSearch, setRestaurantSearch] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [selectedSlots, setSelectedSlots] = useState([])
  const [partySize, setPartySize] = useState(2)
  const [submitting, setSubmitting] = useState(false)

  // Availability state
  const [availabilityState, setAvailabilityState] = useState('idle')
  const [availableSlots, setAvailableSlots] = useState([])
  const [availabilityError, setAvailabilityError] = useState('')
  const [bookingSlot, setBookingSlot] = useState(null)
  const [bookingResult, setBookingResult] = useState(null)

  const startStep = skipStep1 ? 2 : 1
  const [currentStep, setCurrentStep] = useState(startStep)

  const allSteps = ['Restaurant', 'Date', 'Time Slots', 'Party Size', 'Review']
  const visibleSteps = skipStep1 ? allSteps.slice(1) : allSteps

  useEffect(() => {
    if (isOpen) {
      setSelectedRestaurant(preselectedRestaurant || null)
      setRestaurantSearch('')
      setTargetDate('')
      setSelectedSlots([])
      setPartySize(2)
      setSubmitting(false)
      setCurrentStep(skipStep1 ? 2 : 1)
      setAvailabilityState('idle')
      setAvailableSlots([])
      setAvailabilityError('')
      setBookingSlot(null)
      setBookingResult(null)
    }
  }, [isOpen, preselectedRestaurant])

  const filteredRestaurants = useMemo(() => {
    if (!restaurantSearch) return restaurants || []
    const q = restaurantSearch.toLowerCase()
    return (restaurants || []).filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.neighborhood && r.neighborhood.toLowerCase().includes(q))
    )
  }, [restaurants, restaurantSearch])

  const toggleSlot = (slot) => {
    setSelectedSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
    )
  }

  const canGoNext = () => {
    switch (currentStep) {
      case 1: return !!selectedRestaurant
      case 2: return !!targetDate && targetDate >= getTomorrow()
      case 3: return selectedSlots.length > 0
      case 4: return partySize >= 1 && partySize <= 20
      default: return false
    }
  }

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > startStep) setCurrentStep(currentStep - 1)
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await invoke('db:create-watch-job', {
        restaurant_id: selectedRestaurant.id,
        target_date: targetDate,
        time_slots: selectedSlots,
        party_size: partySize,
        priority: 'normal'
      })
      onCreated()
      onClose()
    } catch (err) {
      console.error('Failed to create watch job:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Availability check
  const checkAvailability = useCallback(async () => {
    if (!selectedRestaurant || selectedRestaurant.platform !== 'Resy') return
    setAvailabilityState('loading')
    setAvailableSlots([])
    setAvailabilityError('')
    setBookingResult(null)
    try {
      const result = await invoke('resy:check-availability', {
        restaurant_id: selectedRestaurant.id,
        date: targetDate,
        party_size: partySize
      })
      if (result.unsupported) {
        setAvailabilityState('idle')
        return
      }
      if (result.noCredentials) {
        setAvailabilityState('error')
        setAvailabilityError('Not signed into Resy — go to Settings to sign in')
        return
      }
      if (result.success) {
        setAvailableSlots(result.slots || [])
        setAvailabilityState('loaded')
      } else {
        setAvailabilityState('error')
        setAvailabilityError(result.error || 'Failed to check availability')
      }
    } catch (err) {
      setAvailabilityState('error')
      setAvailabilityError(err.message || 'Failed to check availability')
    }
  }, [selectedRestaurant, targetDate, partySize, invoke])

  // Auto-check when reaching Review step for Resy restaurants
  useEffect(() => {
    if (currentStep === 5 && selectedRestaurant?.platform === 'Resy') {
      checkAvailability()
    }
  }, [currentStep])

  const handleBookNow = async (slot) => {
    setBookingSlot(slot.config_id)
    setBookingResult(null)
    try {
      const result = await invoke('resy:book-now', {
        restaurant_id: selectedRestaurant.id,
        config_id: slot.config_id,
        date: targetDate,
        party_size: partySize,
        time: slot.time
      })
      setBookingResult(result)
      if (result.success) {
        setTimeout(() => {
          onCreated()
          onClose()
        }, 2500)
      }
    } catch (err) {
      setBookingResult({ success: false, error: err.message || 'Booking failed' })
    } finally {
      setBookingSlot(null)
    }
  }

  const handleRetryAvailability = () => {
    checkAvailability()
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  const portalRoot = document.body
  const isResy = selectedRestaurant?.platform === 'Resy'

  const renderAvailabilitySection = () => {
    if (!isResy) {
      return (
        <div className="availability-section">
          <p className="wizard-hint">Instant availability check is not yet supported for {selectedRestaurant?.platform}. Create a watch job to monitor for openings.</p>
        </div>
      )
    }

    return (
      <div className="availability-section">
        <div className="availability-section__header">
          <span className="wizard-label" style={{ margin: 0 }}>Current Availability</span>
          {availabilityState !== 'loading' && (
            <button
              type="button"
              className="availability-section__refresh"
              onClick={handleRetryAvailability}
              title="Refresh availability"
            >
              &#8635;
            </button>
          )}
        </div>

        {availabilityState === 'loading' && (
          <div className="availability-section__loading">
            <div className="credential-signing-spinner" />
            <span>Checking availability...</span>
          </div>
        )}

        {availabilityState === 'error' && (
          <div className="availability-section__error">
            <span>{availabilityError}</span>
            <button
              type="button"
              className="wizard-btn wizard-btn--secondary"
              onClick={handleRetryAvailability}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {availabilityState === 'loaded' && availableSlots.length === 0 && (
          <div className="availability-section__empty">
            No slots currently available for this date and party size. Create a watch job to get notified when one opens up.
          </div>
        )}

        {availabilityState === 'loaded' && availableSlots.length > 0 && (
          <>
            <p className="wizard-hint">{availableSlots.length} slot{availableSlots.length !== 1 ? 's' : ''} available right now</p>
            <div className="availability-slots">
              {availableSlots.map((slot) => (
                <div key={slot.config_id} className="availability-slot">
                  <span className="availability-slot__time">{slot.time}</span>
                  {slot.type && <span className="availability-slot__type">{slot.type}</span>}
                  <button
                    type="button"
                    className="availability-slot__book-btn"
                    disabled={!!bookingSlot}
                    onClick={() => handleBookNow(slot)}
                  >
                    {bookingSlot === slot.config_id ? 'Booking...' : 'Book Now'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {bookingResult && !bookingResult.success && (
          <div className="availability-section__booking-error">
            <span>{bookingResult.error}</span>
            {bookingResult.conflict && (
              <button
                type="button"
                className="wizard-btn wizard-btn--secondary"
                onClick={handleRetryAvailability}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                Refresh Slots
              </button>
            )}
          </div>
        )}

        {bookingResult?.success && (
          <div className="availability-section__booking-success">
            Booked! {bookingResult.confirmation_code && <>Confirmation: <strong>{bookingResult.confirmation_code}</strong></>}
          </div>
        )}
      </div>
    )
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="wizard-step-content">
            <label className="wizard-label">Select Restaurant</label>
            <input
              type="text"
              className="wizard-input"
              placeholder="Search restaurants..."
              value={restaurantSearch}
              onChange={e => setRestaurantSearch(e.target.value)}
            />
            <div className="wizard-restaurant-list">
              {filteredRestaurants.map(r => (
                <div
                  key={r.id}
                  className={`wizard-restaurant-item${selectedRestaurant?.id === r.id ? ' wizard-restaurant-item--selected' : ''}`}
                  onClick={() => setSelectedRestaurant(r)}
                >
                  <RestaurantThumbnail restaurant={r} size="sm" />
                  <div className="wizard-restaurant-item__info">
                    <span className="wizard-restaurant-item__name">{r.name}</span>
                    <span className="wizard-restaurant-item__meta">
                      {r.neighborhood}, {r.borough} &middot; {r.platform}
                    </span>
                  </div>
                </div>
              ))}
              {filteredRestaurants.length === 0 && (
                <div className="wizard-restaurant-list__empty">No restaurants found</div>
              )}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="wizard-step-content">
            <label className="wizard-label">Target Date</label>
            <input
              type="date"
              className="wizard-input"
              min={getTomorrow()}
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
            />
            {targetDate && targetDate < getTomorrow() && (
              <p className="wizard-validation-error">Date must be tomorrow or later</p>
            )}
          </div>
        )

      case 3:
        return (
          <div className="wizard-step-content">
            <label className="wizard-label">Select Time Slots</label>
            <p className="wizard-hint">Choose one or more preferred time slots</p>
            <div className="time-slot-grid">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot}
                  type="button"
                  className={`time-slot${selectedSlots.includes(slot) ? ' time-slot--selected' : ''}`}
                  onClick={() => toggleSlot(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="wizard-step-content">
            <label className="wizard-label">Party Size</label>
            <input
              type="number"
              className="wizard-input"
              min={1}
              max={20}
              value={partySize}
              onChange={e => setPartySize(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            />
          </div>
        )

      case 5:
        return (
          <div className="wizard-step-content">
            <label className="wizard-label">Review Your Watch Job</label>
            <div className="wizard-review">
              <div className="wizard-review__row">
                <span className="wizard-review__label">Restaurant</span>
                <span className="wizard-review__value">{selectedRestaurant?.name}</span>
              </div>
              <div className="wizard-review__row">
                <span className="wizard-review__label">Date</span>
                <span className="wizard-review__value">{targetDate}</span>
              </div>
              <div className="wizard-review__row">
                <span className="wizard-review__label">Time Slots</span>
                <span className="wizard-review__value">{selectedSlots.join(', ')}</span>
              </div>
              <div className="wizard-review__row">
                <span className="wizard-review__label">Party Size</span>
                <span className="wizard-review__value">{partySize}</span>
              </div>
              <div className="wizard-review__row">
                <span className="wizard-review__label">Platform</span>
                <span className="wizard-review__value">{selectedRestaurant?.platform}</span>
              </div>
            </div>

            {renderAvailabilitySection()}
          </div>
        )

      default:
        return null
    }
  }

  return createPortal(
    <div className="wizard-overlay" onClick={handleBackdropClick}>
      <div className="wizard-modal">
        <div className="wizard-header">
          <h3 className="wizard-header__title">New Watch Job</h3>
          <button className="wizard-header__close" onClick={onClose}>&times;</button>
        </div>

        <WizardStepIndicator
          steps={visibleSteps}
          currentStep={skipStep1 ? currentStep - 1 : currentStep}
        />

        <div className="wizard-body">
          {renderStepContent()}
        </div>

        <div className="wizard-footer">
          {currentStep > startStep && (
            <button className="wizard-btn wizard-btn--secondary" onClick={handleBack}>
              Back
            </button>
          )}
          <div className="wizard-footer__spacer" />
          {currentStep < 5 ? (
            <button
              className="wizard-btn wizard-btn--primary"
              disabled={!canGoNext()}
              onClick={handleNext}
            >
              Next
            </button>
          ) : bookingResult?.success ? (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={() => { onCreated(); onClose() }}
            >
              Done
            </button>
          ) : (
            <button
              className="wizard-btn wizard-btn--primary"
              disabled={submitting}
              onClick={handleConfirm}
            >
              {submitting ? 'Creating...' : 'Create Watch Job'}
            </button>
          )}
        </div>
      </div>
    </div>,
    portalRoot
  )
}
