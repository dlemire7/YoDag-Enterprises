import { getActiveWatchJobs, getRestaurantById, updateWatchJob, updateRestaurantVenueId, createBookingRecord } from './database.js'
import { getCredential } from './credentials.js'
import { resolveVenueId, getBookingDetails, getPaymentMethod, bookReservation, setSessionCookies } from './platforms/resy-api.js'
import { extractResyToken, checkAvailability as browserCheckAvailability } from './platforms/resy.js'
import { notifyBookingSuccess, notifyBookingFailed, notifyCaptchaRequired } from './notifications.js'

const TICK_INTERVAL_MS = 10_000
const MAX_CONCURRENT = 10
const RELEASE_WINDOW_SEC = 60
const RELEASE_AGGRESSIVE_INTERVAL_MS = 4_000
const RELEASE_FALLBACK_AFTER_MIN = 10

let intervalId = null
let mainWindow = null
const lastPollTime = new Map()
const retryCount = new Map()
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
  retryCount.clear()
  activeCount = 0
  console.log('[Scheduler] Stopped')
}

/**
 * Parse a reservation_release string like "30 days ahead" into a release Date
 * for the given target date. Assumes midnight ET release unless specified.
 * Returns { releaseTime: Date, parseable: boolean }
 */
function parseReleaseSchedule(releaseStr, targetDate) {
  if (!releaseStr || !targetDate) return { releaseTime: null, parseable: false }

  // Match patterns like "30 days ahead", "14 days ahead", "6 weeks ahead"
  const daysMatch = releaseStr.match(/^(\d+)\s*days?\s*ahead/i)
  const weeksMatch = releaseStr.match(/^(\d+)\s*weeks?\s*ahead/i)

  let daysAhead = null
  if (daysMatch) {
    daysAhead = parseInt(daysMatch[1], 10)
  } else if (weeksMatch) {
    daysAhead = parseInt(weeksMatch[1], 10) * 7
  }

  if (daysAhead === null) return { releaseTime: null, parseable: false }

  // Release date = target date minus N days, at midnight ET
  const target = new Date(targetDate + 'T00:00:00')
  const releaseDate = new Date(target)
  releaseDate.setDate(releaseDate.getDate() - daysAhead)

  // Set to midnight Eastern Time (ET = UTC-5, EDT = UTC-4)
  // Use a fixed offset approximation: midnight ET = 05:00 UTC
  const releaseTime = new Date(
    releaseDate.getFullYear(),
    releaseDate.getMonth(),
    releaseDate.getDate(),
    0, 0, 0, 0
  )

  return { releaseTime, parseable: true }
}

/**
 * Determine the effective poll interval for a job based on its monitoring strategy
 * and the current time relative to the release window.
 */
function getEffectiveInterval(job) {
  if (job.monitoring_strategy !== 'release_time' || !job.reservation_release) {
    return (job.poll_interval_sec || 30) * 1000
  }

  const { releaseTime, parseable } = parseReleaseSchedule(job.reservation_release, job.target_date)
  if (!parseable || !releaseTime) {
    return (job.poll_interval_sec || 30) * 1000
  }

  const now = new Date()
  const msUntilRelease = releaseTime.getTime() - now.getTime()
  const msAfterRelease = -msUntilRelease

  // Release already passed (more than 10 minutes ago): continuous polling
  if (msAfterRelease >= RELEASE_FALLBACK_AFTER_MIN * 60 * 1000) {
    return 30_000
  }

  // Within 10 minutes after release or 60 seconds before: aggressive polling
  if (msAfterRelease >= 0 || msUntilRelease <= RELEASE_WINDOW_SEC * 1000) {
    return RELEASE_AGGRESSIVE_INTERVAL_MS
  }

  // More than 60 seconds before release: poll at a slow background rate
  // (so we can still detect cancellations that free up slots early)
  return 120_000
}

async function tick() {
  let jobs
  try {
    jobs = getActiveWatchJobs()
  } catch (err) {
    console.error('[Scheduler] Failed to fetch jobs:', err.message)
    return
  }

  if (jobs.length === 0) {
    // One-time log at startup to confirm scheduler can read DB
    if (!tick._loggedEmpty) {
      console.log('[Scheduler] No active jobs found (status: pending or monitoring)')
      tick._loggedEmpty = true
    }
    return
  }
  tick._loggedEmpty = false // Reset so we log again if jobs disappear

  const now = Date.now()

  for (const job of jobs) {
    if (activeCount >= MAX_CONCURRENT) break

    const lastPoll = lastPollTime.get(job.id) || 0
    const interval = getEffectiveInterval(job)
    if (now - lastPoll < interval) continue

    lastPollTime.set(job.id, now)
    activeCount++
    processJob(job).finally(() => { activeCount-- })
  }
}

async function processJob(job) {
  const today = new Date().toISOString().split('T')[0]
  const jobName = job.restaurant_name || job.name || `job ${job.id.slice(0, 8)}`

  try {
    // Only Resy is supported for now — check BEFORE transitioning status
    const platform = job.platform || job.restaurant_platform
    if (platform !== 'Resy') {
      // Don't spam logs — only log once per job
      if (job.status === 'pending') {
        console.log(`[Scheduler] ${jobName}: platform "${platform}" not yet supported, keeping as pending`)
      }
      return
    }

    // Transition pending → monitoring
    if (job.status === 'pending') {
      updateWatchJob(job.id, { status: 'monitoring' })
      console.log(`[Scheduler] ${jobName}: pending → monitoring`)
      sendUpdate()
    }

    // Check if target date has expired
    if (job.target_date < today) {
      console.log(`[Scheduler] ${jobName}: target date ${job.target_date} expired`)
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: jobName,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform,
        status: 'failed',
        error_details: 'Target date has expired'
      })
      cleanupJob(job.id)
      sendUpdate()
      return
    }

    // Get saved session
    const session = getCredential('Resy')
    if (session) {
      setSessionCookies(session)
    }
    if (!session) {
      console.log(`[Scheduler] ${jobName}: no Resy credentials found — failing job`)
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: jobName,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform: 'Resy',
        status: 'failed',
        error_details: 'No credentials — sign in on Settings page'
      })
      cleanupJob(job.id)
      sendUpdate()
      return
    }

    // Extract auth token — use Resy-specific extractor that checks for injected token
    const authToken = extractResyToken(session)
    if (!authToken) {
      console.log(`[Scheduler] ${jobName}: could not extract auth token from saved session — failing job`)
      updateWatchJob(job.id, { status: 'failed' })
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: jobName,
        date: job.target_date,
        time: '',
        party_size: job.party_size,
        platform: 'Resy',
        status: 'failed',
        error_details: 'Could not extract auth token — re-sign in on Settings page'
      })
      cleanupJob(job.id)
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
        applyBackoff(job)
        return
      }
    }

    if (!venueId) {
      console.log(`[Scheduler] No venue_id or URL for restaurant ${job.restaurant_id}`)
      return
    }

    // Find availability (uses Playwright browser context to bypass Incapsula CDN)
    let slots
    try {
      slots = await browserCheckAvailability(session, venueId, job.target_date, job.party_size)
    } catch (err) {
      handleApiError(err, job, jobName)
      return
    }

    // Successful API call — reset retry count
    retryCount.delete(job.id)

    const desiredSlots = parseTimeSlots(job.time_slots)
    console.log(`[Scheduler] ${jobName}: ${slots.length} slots on ${job.target_date}, looking for: [${desiredSlots.join(', ')}]`)
    if (slots.length > 0 && slots.length <= 20) {
      console.log(`[Scheduler] ${jobName}: available times: [${slots.map(s => s.time).join(', ')}]`)
    }

    // Match against desired time slots
    const matchingSlots = slots.filter(s => desiredSlots.some(d => timeMatches(s.time, d)))

    if (matchingSlots.length === 0) {
      if (slots.length > 0) {
        console.log(`[Scheduler] ${jobName}: no time match — keep polling`)
      }
      return
    }

    // Try to book the first matching slot
    const slot = matchingSlots[0]
    console.log(`[Scheduler] ${jobName}: MATCH! Attempting to book ${slot.time}...`)

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
        restaurant: jobName,
        date: job.target_date,
        time: slot.time,
        party_size: job.party_size,
        platform: 'Resy',
        status: 'success',
        confirmation_code: result.confirmation_code || ''
      })
      cleanupJob(job.id)
      sendUpdate()

      notifyBookingSuccess(
        jobName,
        job.target_date,
        slot.time,
        result.confirmation_code || ''
      )
      console.log(`[Scheduler] BOOKED! ${jobName} on ${job.target_date} at ${slot.time}`)
    } catch (err) {
      console.error(`[Scheduler] Booking failed:`, err.message)

      // Booking conflict detection — slot taken between detection and booking
      const isConflict = /taken|unavailable|no longer|already.*booked|slot.*gone/i.test(err.message)
      createBookingRecord({
        watch_job_id: job.id,
        restaurant: jobName,
        date: job.target_date,
        time: slot.time,
        party_size: job.party_size,
        platform: 'Resy',
        status: isConflict ? 'conflict' : 'failed',
        error_details: err.message
      })
      sendUpdate()

      if (isConflict) {
        // Reset poll timer for immediate retry on next tick
        lastPollTime.delete(job.id)
        console.log(`[Scheduler] Slot conflict — will retry immediately for ${jobName}`)
      }
      // Keep job monitoring — don't fail on booking error
    }
  } catch (err) {
    console.error(`[Scheduler] Unexpected error processing job ${job.id}:`, err.message)
  }
}

function handleApiError(err, job, jobName) {
  const code = err.statusCode
  const msg = (err.message || '').toLowerCase()

  // CAPTCHA detection
  if ((code === 403 || code === 429) && /captcha|challenge|verify|recaptcha/i.test(msg)) {
    updateWatchJob(job.id, { status: 'paused' })
    createBookingRecord({
      watch_job_id: job.id,
      restaurant: jobName,
      date: job.target_date,
      time: '',
      party_size: job.party_size,
      platform: 'Resy',
      status: 'failed',
      error_details: 'CAPTCHA required — complete manually and resume'
    })
    cleanupJob(job.id)
    sendUpdate()
    sendCaptchaAlert(job)
    notifyCaptchaRequired(jobName)
    console.warn(`[Scheduler] CAPTCHA detected for job ${job.id}`)
    return
  }

  if (code === 401 || code === 403) {
    updateWatchJob(job.id, { status: 'failed' })
    createBookingRecord({
      watch_job_id: job.id,
      restaurant: jobName,
      date: job.target_date,
      time: '',
      party_size: job.party_size,
      platform: 'Resy',
      status: 'failed',
      error_details: 'Session expired — re-sign in on Settings page'
    })
    cleanupJob(job.id)
    sendUpdate()
    notifyBookingFailed(jobName, 'Session expired')
  } else if (code === 429) {
    // Rate limited — apply exponential backoff
    applyBackoff(job, true)
    console.warn(`[Scheduler] Rate limited for job ${job.id}, backing off`)
  } else {
    // Server error — apply exponential backoff
    applyBackoff(job)
    console.error(`[Scheduler] API error for job ${job.id}:`, err.message)
  }
}

/**
 * Apply exponential backoff for a job. Doubles the wait time on each retry.
 * @param {boolean} isRateLimit - If true, use more aggressive backoff
 */
function applyBackoff(job, isRateLimit = false) {
  const count = (retryCount.get(job.id) || 0) + 1
  retryCount.set(job.id, count)

  const baseMs = (job.poll_interval_sec || 30) * 1000
  const multiplier = isRateLimit ? 3 : 2
  const backoffMs = Math.min(baseMs * Math.pow(multiplier, count - 1), 300_000) // Cap at 5 minutes
  lastPollTime.set(job.id, Date.now() + backoffMs - (job.poll_interval_sec || 30) * 1000)

  if (count >= 3) {
    console.warn(`[Scheduler] Job ${job.id} has failed ${count} times in a row, still retrying with ${Math.round(backoffMs / 1000)}s backoff`)
  }
}

function cleanupJob(jobId) {
  lastPollTime.delete(jobId)
  retryCount.delete(jobId)
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

function sendCaptchaAlert(job) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('monitor:captcha-required', {
        jobId: job.id,
        restaurant: job.restaurant_name || job.name
      })
    }
  } catch { /* window may be closing */ }
}

export function resumeJob(jobId) {
  updateWatchJob(jobId, { status: 'monitoring' })
  lastPollTime.delete(jobId)
  retryCount.delete(jobId)
  sendUpdate()
}

export function getSchedulerStatus() {
  return {
    running: intervalId !== null,
    activeJobs: activeCount,
    trackedJobs: lastPollTime.size
  }
}
