import { getActiveWatchJobs, getRestaurantById, updateWatchJob, updateRestaurantVenueId, createBookingRecord } from './database.js'
import { getCredential } from './credentials.js'
import { extractAuthToken, resolveVenueId, findAvailability, getBookingDetails, getPaymentMethod, bookReservation } from './platforms/resy-api.js'

const TICK_INTERVAL_MS = 10_000
const MAX_CONCURRENT = 3

let intervalId = null
let mainWindow = null
const lastPollTime = new Map()
let activeCount = 0

export function startScheduler(window) {
  mainWindow = window
  console.log('[Scheduler] Starting monitoring engine')
  intervalId = setInterval(tick, TICK_INTERVAL_MS)
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  lastPollTime.clear()
  activeCount = 0
  console.log('[Scheduler] Stopped')
}

async function tick() {
  let jobs
  try {
    jobs = getActiveWatchJobs()
  } catch (err) {
    console.error('[Scheduler] Failed to fetch jobs:', err.message)
    return
  }

  if (jobs.length === 0) return

  const now = Date.now()

  for (const job of jobs) {
    if (activeCount >= MAX_CONCURRENT) break

    const lastPoll = lastPollTime.get(job.id) || 0
    const interval = (job.poll_interval_sec || 30) * 1000
    if (now - lastPoll < interval) continue

    lastPollTime.set(job.id, now)
    activeCount++
    processJob(job).finally(() => { activeCount-- })
  }
}

async function processJob(job) {
  const today = new Date().toISOString().split('T')[0]

  try {
    // Transition pending → monitoring
    if (job.status === 'pending') {
      updateWatchJob(job.id, { status: 'monitoring' })
      sendUpdate()
    }

    // Check if target date has expired
    if (job.target_date < today) {
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: job.restaurant_name || job.name,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform: job.platform || job.restaurant_platform,
        status: 'failed',
        error_details: 'Target date has expired'
      })
      sendUpdate()
      return
    }

    // Only Resy is supported for now
    const platform = job.platform || job.restaurant_platform
    if (platform !== 'Resy') {
      console.log(`[Scheduler] Skipping job ${job.id} — platform "${platform}" not yet supported`)
      return
    }

    // Get saved session
    const session = getCredential('Resy')
    if (!session) {
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: job.restaurant_name || job.name,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform: 'Resy',
        status: 'failed',
        error_details: 'No credentials — sign in on Settings page'
      })
      sendUpdate()
      return
    }

    // Extract auth token
    const authToken = extractAuthToken(session)
    if (!authToken) {
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: job.restaurant_name || job.name,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform: 'Resy',
        status: 'failed',
        error_details: 'Could not extract auth token — re-sign in on Settings page'
      })
      sendUpdate()
      return
    }

    // Resolve venue_id (cache in DB)
    const restaurant = getRestaurantById(job.restaurant_id)
    let venueId = restaurant?.venue_id
    if (!venueId && restaurant?.url) {
      try {
        venueId = await resolveVenueId(authToken, restaurant.url)
        if (venueId) {
          updateRestaurantVenueId(restaurant.id, venueId)
        }
      } catch (err) {
        console.error(`[Scheduler] Failed to resolve venue_id for ${restaurant.name}:`, err.message)
        return // Retry next tick
      }
    }

    if (!venueId) {
      console.log(`[Scheduler] No venue_id or URL for restaurant ${job.restaurant_id}`)
      return
    }

    // Find availability
    let slots
    try {
      slots = await findAvailability(authToken, venueId, job.target_date, job.party_size)
    } catch (err) {
      handleApiError(err, job)
      return
    }

    console.log(`[Scheduler] ${job.restaurant_name || restaurant?.name}: ${slots.length} slots found for ${job.target_date}`)

    // Match against desired time slots
    const desiredSlots = parseTimeSlots(job.time_slots)
    const matchingSlots = slots.filter(s => desiredSlots.some(d => timeMatches(s.time, d)))

    if (matchingSlots.length === 0) return // No match — keep polling

    // Try to book the first matching slot
    const slot = matchingSlots[0]
    console.log(`[Scheduler] Match found! Attempting to book ${slot.time} at ${job.restaurant_name || restaurant?.name}`)

    try {
      const bookToken = await getBookingDetails(authToken, slot.config_id, job.target_date, job.party_size)
      if (!bookToken) throw new Error('No book_token returned')

      const paymentId = await getPaymentMethod(authToken)
      const result = await bookReservation(authToken, bookToken, paymentId)

      // Success!
      updateWatchJob(job.id, {
        status: 'booked',
        booked_at: new Date().toISOString(),
        confirmation_code: result.confirmation_code || ''
      })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: job.restaurant_name || restaurant?.name,
        date: job.target_date,
        time: slot.time,
        party_size: job.party_size,
        platform: 'Resy',
        status: 'success',
        confirmation_code: result.confirmation_code || ''
      })
      lastPollTime.delete(job.id)
      sendUpdate()
      console.log(`[Scheduler] BOOKED! ${job.restaurant_name || restaurant?.name} on ${job.target_date} at ${slot.time}`)
    } catch (err) {
      console.error(`[Scheduler] Booking failed:`, err.message)
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: job.restaurant_name || restaurant?.name,
        date: job.target_date,
        time: slot.time,
        party_size: job.party_size,
        platform: 'Resy',
        status: 'failed',
        error_details: err.message
      })
      sendUpdate()
      // Keep job monitoring — don't fail on booking error
    }
  } catch (err) {
    console.error(`[Scheduler] Unexpected error processing job ${job.id}:`, err.message)
  }
}

function handleApiError(err, job) {
  const code = err.statusCode
  if (code === 401 || code === 403) {
    updateWatchJob(job.id, { status: 'failed' })
    createBookingRecord({
      watch_job_id: job.id,
      restaurant: job.restaurant_name || job.name,
      date: job.target_date,
      time: '',
      party_size: job.party_size,
      platform: 'Resy',
      status: 'failed',
      error_details: 'Session expired — re-sign in on Settings page'
    })
    sendUpdate()
  } else if (code === 429) {
    // Rate limited — temporarily back off by doubling the effective interval
    const lastPoll = lastPollTime.get(job.id) || Date.now()
    lastPollTime.set(job.id, lastPoll + (job.poll_interval_sec || 30) * 1000)
    console.warn(`[Scheduler] Rate limited for job ${job.id}, backing off`)
  } else {
    console.error(`[Scheduler] API error for job ${job.id}:`, err.message)
    // Server error — retry next tick
  }
}

function parseTimeSlots(timeSlotsRaw) {
  if (!timeSlotsRaw) return []
  if (Array.isArray(timeSlotsRaw)) return timeSlotsRaw
  try {
    const parsed = JSON.parse(timeSlotsRaw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function timeMatches(slotTime, desiredTime) {
  // Normalize both to compare: strip spaces, lowercase
  const normalize = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalize(slotTime) === normalize(desiredTime)
}

function sendUpdate() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('monitor:job-update')
    }
  } catch { /* window may be closing */ }
}

export function getSchedulerStatus() {
  return {
    running: intervalId !== null,
    activeJobs: activeCount,
    trackedJobs: lastPollTime.size
  }
}
