import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { initDatabase, getRestaurants, getWatchJobs, getBookingHistory, createWatchJob, updateWatchJob, cancelWatchJob, getDatabase, closeDatabase, getRestaurantsWithoutImages, updateRestaurantImage, getRestaurantById, updateRestaurantVenueId, createBookingRecord, createRestaurant, getUnknownPlatformRestaurants, updateRestaurantPlatform, getBookableRestaurants, getRestaurantsWithoutGoogleData, updateRestaurantGoogleData } from './database.js'
import { seedRestaurants } from './seed-data.js'
import { fetchAllMissingImages, fetchImageForRestaurant } from './image-fetcher.js'
import { fetchAllMissingGoogleData } from './google-fetcher.js'
import { saveCredential, getCredential, deleteCredential, getAllCredentialStatuses, markValidated, validateResySession } from './credentials.js'
import { startScheduler, stopScheduler, getSchedulerStatus, resumeJob } from './scheduler.js'
import { setNotificationWindow, notifyBookingSuccess } from './notifications.js'
import { setSessionCookies, resolveVenueId, findAvailability, getBookingDetails, getPaymentMethod, bookReservation, getVenueCalendar, searchVenues } from './platforms/resy-api.js'
import { createTray, updateContextMenu, destroyTray, createAppIcon } from './tray.js'
import * as resyPlatform from './platforms/resy.js'
import * as tockPlatform from './platforms/tock.js'
import * as opentablePlatform from './platforms/opentable.js'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#ffffff',
    title: 'NYC Elite Reservations',
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.handle('db:get-restaurants', async () => {
    return getRestaurants()
  })

  ipcMain.handle('db:get-watch-jobs', async () => {
    return getWatchJobs()
  })

  ipcMain.handle('db:get-booking-history', async () => {
    return getBookingHistory()
  })

  ipcMain.handle('db:create-watch-job', async (_, data) => {
    const result = createWatchJob(data)
    updateContextMenu()
    return result
  })

  ipcMain.handle('db:update-watch-job', async (_, id, fields) => {
    const result = updateWatchJob(id, fields)
    updateContextMenu()
    return result
  })

  ipcMain.handle('db:delete-watch-job', async (_, id) => {
    const result = cancelWatchJob(id)
    updateContextMenu()
    return result
  })

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion()
  })

  ipcMain.handle('db:fetch-restaurant-images', async () => {
    const missing = getRestaurantsWithoutImages()
    if (missing.length === 0) return { fetched: 0, total: 0 }
    const fetched = await fetchAllMissingImages(missing, updateRestaurantImage, (done, total, name) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('images:progress', { done, total, name })
      }
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('images:complete')
    }
    return { fetched, total: missing.length }
  })

  ipcMain.handle('db:fetch-google-data', async () => {
    const missing = getRestaurantsWithoutGoogleData()
    if (missing.length === 0) return { fetched: 0, total: 0 }
    const fetched = await fetchAllMissingGoogleData(missing, updateRestaurantGoogleData, (done, total, name) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('google:progress', { done, total, name })
      }
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('google:complete')
    }
    return { fetched, total: missing.length }
  })

  // Credential Management
  ipcMain.handle('credentials:get-all-statuses', async () => {
    return getAllCredentialStatuses()
  })

  ipcMain.handle('credentials:delete', async (_, platform) => {
    deleteCredential(platform)
    return getAllCredentialStatuses()
  })

  ipcMain.handle('credentials:browser-login', async (_, platform, method) => {
    const platformModules = {
      Resy: resyPlatform,
      Tock: tockPlatform,
      OpenTable: opentablePlatform
    }

    const mod = platformModules[platform]
    if (!mod) {
      return { success: false, error: `Unknown platform: ${platform}` }
    }

    const result = await mod.browserLogin()
    if (result.success) {
      saveCredential(platform, result.session)
      markValidated(platform)
    }
    return result
  })

  // Credential validation — on-demand revalidation from renderer
  ipcMain.handle('credentials:validate', async () => {
    return validateCredentials()
  })

  ipcMain.handle('monitor:get-status', async () => {
    return getSchedulerStatus()
  })

  ipcMain.handle('monitor:resume-job', async (_, jobId) => {
    resumeJob(jobId)
    updateContextMenu()
    return { success: true }
  })

  // Instant Availability Check — direct HTTP via resy-api.js (no browser needed)
  ipcMain.handle('resy:check-availability', async (_, { restaurant_id, date, party_size }) => {
    try {
      const restaurant = getRestaurantById(restaurant_id)
      if (!restaurant) return { success: false, error: 'Restaurant not found' }
      if (restaurant.platform !== 'Resy') return { unsupported: true }

      const session = getCredential('Resy')
      if (!session) return { noCredentials: true }

      const authToken = resyPlatform.extractResyToken(session)
      if (!authToken) return { success: false, error: 'Could not extract auth token', sessionExpired: true }

      setSessionCookies(session)

      let venueId = restaurant.venue_id
      if (!venueId) {
        try {
          venueId = await resolveVenueId(authToken, restaurant.url)
          updateRestaurantVenueId(restaurant.id, venueId)
        } catch (err) {
          return { success: false, error: `Could not resolve venue: ${err.message}` }
        }
      }

      const slots = await findAvailability(authToken, venueId, date, party_size)
      return { success: true, slots: slots || [] }
    } catch (err) {
      const statusCode = err.statusCode || err.status
      if (statusCode === 401 || statusCode === 403) {
        return { success: false, error: 'Session expired — please sign in again on Settings', sessionExpired: true }
      }
      if (statusCode === 429) {
        return { success: false, error: 'Rate limited — please wait a moment and try again', rateLimited: true }
      }
      if (statusCode === 500) {
        return { success: false, error: 'Resy server error — this restaurant may not have availability open yet. Try again shortly.' }
      }
      return { success: false, error: err.message || 'Failed to check availability' }
    }
  })

  // Venue Calendar — dates with open slots
  ipcMain.handle('resy:get-calendar', async (_, { restaurant_id, party_size }) => {
    try {
      const restaurant = getRestaurantById(restaurant_id)
      if (!restaurant) return { success: false, error: 'Restaurant not found' }
      if (restaurant.platform !== 'Resy') return { unsupported: true }

      const session = getCredential('Resy')
      if (!session) return { noCredentials: true }

      const authToken = resyPlatform.extractResyToken(session)
      if (!authToken) return { success: false, error: 'Could not extract auth token', sessionExpired: true }

      setSessionCookies(session)

      let venueId = restaurant.venue_id
      if (!venueId) {
        try {
          venueId = await resolveVenueId(authToken, restaurant.url)
          updateRestaurantVenueId(restaurant.id, venueId)
        } catch (err) {
          return { success: false, error: `Could not resolve venue: ${err.message}` }
        }
      }

      const dates = await getVenueCalendar(authToken, venueId, party_size)
      return { success: true, dates }
    } catch (err) {
      return { success: false, error: err.message || 'Failed to fetch calendar' }
    }
  })

  // Tock Availability Check
  ipcMain.handle('tock:check-availability', async (_, { restaurant_id, date, party_size }) => {
    try {
      const restaurant = getRestaurantById(restaurant_id)
      if (!restaurant) return { success: false, error: 'Restaurant not found' }
      if (restaurant.platform !== 'Tock') return { unsupported: true }

      const session = getCredential('Tock')
      if (!session) return { noCredentials: true }

      const slots = await tockPlatform.checkAvailability(session, restaurant.url, date, party_size)
      return { success: true, slots: slots || [] }
    } catch (err) {
      if (err.message?.includes('timeout')) {
        return { success: false, error: 'Tock page took too long to load. Try again.' }
      }
      return { success: false, error: err.message || 'Failed to check availability' }
    }
  })

  // Restaurant Search — search across platforms
  ipcMain.handle('restaurant:search', async (_, { query, platform }) => {
    console.log(`[Search] Searching ${platform} for "${query}"`)
    try {
      if (platform === 'Resy') {
        const session = getCredential('Resy')
        if (!session) { console.log('[Search] No Resy credentials'); return { success: false, noCredentials: true } }
        const authToken = resyPlatform.extractResyToken(session)
        if (!authToken) { console.log('[Search] Could not extract Resy auth token'); return { success: false, sessionExpired: true, error: 'Could not extract auth token' } }
        setSessionCookies(session)
        console.log(`[Search] Calling Resy searchVenues with token ${authToken.slice(0, 6)}...`)
        const results = await searchVenues(authToken, query)
        console.log(`[Search] Resy returned ${results.length} results`)
        return { success: true, results }
      }

      if (platform === 'Tock') {
        const session = getCredential('Tock')
        if (!session) return { success: false, noCredentials: true }
        const results = await tockPlatform.searchRestaurants(session, query)
        return { success: true, results }
      }

      if (platform === 'OpenTable') {
        const results = await opentablePlatform.searchRestaurants(query)
        return { success: true, results }
      }

      return { success: false, error: `Unknown platform: ${platform}` }
    } catch (err) {
      console.error(`[Search] Error searching ${platform}:`, err.message, err.statusCode ? `(HTTP ${err.statusCode})` : '')
      const statusCode = err.statusCode || err.status
      if (statusCode === 401 || statusCode === 403) {
        return { success: false, error: 'Session expired — please sign in again on Settings', sessionExpired: true }
      }
      return { success: false, error: err.message || 'Search failed' }
    }
  })

  // Add Restaurant to DB
  ipcMain.handle('db:add-restaurant', async (_, restaurantData) => {
    try {
      const result = createRestaurant(restaurantData)
      if (result.duplicate) {
        return { success: false, duplicate: true, id: result.id, existingPlatform: result.existingPlatform }
      }

      // Fire-and-forget image fetch if no image provided
      if (!restaurantData.image_url && restaurantData.name) {
        fetchImageForRestaurant(restaurantData.name).then(imageUrl => {
          if (imageUrl) {
            updateRestaurantImage(result.id, imageUrl)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('images:complete')
            }
          }
        }).catch(() => {})
      }

      return { success: true, id: result.id }
    } catch (err) {
      return { success: false, error: err.message || 'Failed to add restaurant' }
    }
  })

  // Tock Book Now (opens in browser)
  ipcMain.handle('tock:book-now', async (_, { restaurant_id, date, party_size, time }) => {
    try {
      const restaurant = getRestaurantById(restaurant_id)
      if (!restaurant) return { success: false, error: 'Restaurant not found' }

      const session = getCredential('Tock')
      if (!session) return { success: false, error: 'No Tock credentials found' }

      const result = await tockPlatform.bookSlot(session, restaurant.url, date, party_size, time)

      if (result.success) {
        createBookingRecord({
          watch_job_id: null,
          restaurant: restaurant.name,
          date,
          time,
          party_size,
          platform: 'Tock',
          status: 'attempted',
          confirmation_code: null,
          attempt_log: `Opened Tock booking page: ${result.url}`,
          error_details: null
        })
        return result
      }
      return { success: false, error: 'Failed to open booking page' }
    } catch (err) {
      return { success: false, error: err.message || 'Booking failed' }
    }
  })

  // Find Available — bulk availability scan across all bookable restaurants
  let findCancelled = false

  ipcMain.on('find:cancel', () => {
    findCancelled = true
  })

  ipcMain.handle('find:search-available', async (_, { date, time_start, time_end, party_size }) => {
    findCancelled = false
    const allBookable = getBookableRestaurants()
    const resyList = allBookable.filter(r => r.platform === 'Resy')
    const tockList = allBookable.filter(r => r.platform === 'Tock')
    const total = resyList.length + tockList.length
    let checked = 0
    let withAvailability = 0
    let errors = 0
    const skippedPlatforms = []

    const sendResult = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('find:result', data)
      }
    }
    const sendProgress = (currentName) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('find:progress', { checked, total, currentName })
      }
    }

    // Validate credentials
    const resySession = getCredential('Resy')
    let resyAuthToken = null
    if (resySession) {
      resyAuthToken = resyPlatform.extractResyToken(resySession)
      if (resyAuthToken) {
        setSessionCookies(resySession)
      }
    }
    if (!resyAuthToken && resyList.length > 0) {
      skippedPlatforms.push('Resy')
      checked += resyList.length
    }

    const tockSession = getCredential('Tock')
    if (!tockSession && tockList.length > 0) {
      skippedPlatforms.push('Tock')
      checked += tockList.length
    }

    // Async semaphore for concurrency control
    function createSemaphore(max) {
      let running = 0
      const queue = []
      return function acquire() {
        return new Promise(resolve => {
          const tryRun = () => {
            if (running < max) {
              running++
              resolve(() => { running--; if (queue.length > 0) queue.shift()() })
            } else {
              queue.push(tryRun)
            }
          }
          tryRun()
        })
      }
    }

    // Resy queue — concurrency 5
    const resySemaphore = createSemaphore(5)
    const resyPromises = resyAuthToken ? resyList.map(async (restaurant) => {
      if (findCancelled) return
      const release = await resySemaphore()
      if (findCancelled) { release(); return }

      sendProgress(restaurant.name)
      try {
        let venueId = restaurant.venue_id
        if (!venueId) {
          try {
            venueId = await resolveVenueId(resyAuthToken, restaurant.url)
            updateRestaurantVenueId(restaurant.id, venueId)
          } catch (err) {
            checked++
            errors++
            sendResult({ restaurant, slots: [], error: `Could not resolve venue: ${err.message}` })
            sendProgress(restaurant.name)
            release()
            return
          }
        }

        let slots = null
        try {
          slots = await findAvailability(resyAuthToken, venueId, date, party_size)
        } catch (err) {
          const statusCode = err.statusCode || err.status
          if (statusCode === 429) {
            // Backoff and retry once
            await new Promise(r => setTimeout(r, 2000))
            if (findCancelled) { release(); return }
            try {
              slots = await findAvailability(resyAuthToken, venueId, date, party_size)
            } catch (retryErr) {
              checked++
              errors++
              sendResult({ restaurant, slots: [], error: retryErr.message || 'Rate limited' })
              sendProgress(restaurant.name)
              release()
              return
            }
          } else {
            checked++
            errors++
            sendResult({ restaurant, slots: [], error: err.message || 'Failed to check' })
            sendProgress(restaurant.name)
            release()
            return
          }
        }

        checked++
        if (slots && slots.length > 0) withAvailability++
        sendResult({ restaurant, slots: slots || [], error: null })
        sendProgress(restaurant.name)
      } catch (err) {
        checked++
        errors++
        sendResult({ restaurant, slots: [], error: err.message || 'Unknown error' })
        sendProgress(restaurant.name)
      }
      release()
    }) : []

    // Tock queue — serial with 500ms delay
    const tockPromise = tockSession ? (async () => {
      for (const restaurant of tockList) {
        if (findCancelled) break
        sendProgress(restaurant.name)
        try {
          const slots = await tockPlatform.checkAvailability(tockSession, restaurant.url, date, party_size)
          checked++
          if (slots && slots.length > 0) withAvailability++
          sendResult({ restaurant, slots: slots || [], error: null })
          sendProgress(restaurant.name)
        } catch (err) {
          checked++
          errors++
          sendResult({ restaurant, slots: [], error: err.message || 'Failed to check' })
          sendProgress(restaurant.name)
        }
        // 500ms delay between Tock checks
        if (!findCancelled) {
          await new Promise(r => setTimeout(r, 500))
        }
      }
    })() : Promise.resolve()

    // Run both queues in parallel
    await Promise.allSettled([...resyPromises, tockPromise])

    return { total, checked, withAvailability, errors, skippedPlatforms }
  })

  // Resolve Beli Platforms — search Resy/Tock/OpenTable for Unknown-platform restaurants
  ipcMain.handle('db:resolve-beli-platforms', async () => {
    const unknowns = getUnknownPlatformRestaurants()
    if (unknowns.length === 0) return { success: true, resolved: 0, total: 0, results: [] }

    // Well-known release schedule overrides
    const RELEASE_OVERRIDES = {
      'torrisi': '30 days ahead',
      'cosme': '30 days ahead',
      '4 charles prime rib': '30 days ahead',
      'don angie': '14 days ahead',
      'i sodi': '14 days ahead',
      'via carota': '14 days ahead',
      'lilia': '14 days ahead',
      'tatiana': '14 days ahead',
      'claro': '14 days ahead',
      'oxomoco': '14 days ahead',
      'thai diner': '14 days ahead',
      'king': '14 days ahead'
    }

    // Platform default release schedules
    const PLATFORM_DEFAULTS = {
      Resy: '14 days ahead',
      Tock: 'Monthly drop',
      OpenTable: '30 days ahead'
    }

    function normalizeName(name) {
      return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents (é→e, ñ→n)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function fuzzyMatch(searchName, resultName) {
      const a = normalizeName(searchName)
      const b = normalizeName(resultName)
      if (a === b) return true
      if (a.includes(b) || b.includes(a)) return true
      // Check if all words of the shorter name appear in the longer name
      const aWords = a.split(' ')
      const bWords = b.split(' ')
      const [shorter, longer] = aWords.length <= bWords.length ? [aWords, b] : [bWords, a]
      if (shorter.length >= 2 && shorter.every(w => longer.includes(w))) return true
      return false
    }

    const results = []
    let resolved = 0

    const sendProgress = (done, total, name, status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('beli:resolve-progress', { done, total, name, status })
      }
    }

    for (let i = 0; i < unknowns.length; i++) {
      const restaurant = unknowns[i]
      const query = restaurant.name
      let matched = false
      let matchResult = null

      sendProgress(i, unknowns.length, query, 'searching')

      // 1. Search OpenTable (no auth needed)
      try {
        const otResults = await opentablePlatform.searchRestaurants(query)
        const otMatch = otResults.find(r => fuzzyMatch(query, r.name))
        if (otMatch) {
          matched = true
          matchResult = { ...otMatch, platform: 'OpenTable' }
        }
      } catch (err) {
        console.log(`[Resolve] OpenTable search failed for "${query}": ${err.message}`)
      }

      // 2. Search Resy (needs auth)
      if (!matched) {
        try {
          const session = getCredential('Resy')
          if (session) {
            const authToken = resyPlatform.extractResyToken(session)
            if (authToken) {
              setSessionCookies(session)
              const resyResults = await searchVenues(authToken, query)
              console.log(`[Resolve] Resy results for "${query}": ${resyResults.length} results — ${resyResults.slice(0, 3).map(r => `"${r.name}"`).join(', ')}`)
              const resyMatch = resyResults.find(r => fuzzyMatch(query, r.name))
              if (resyMatch) {
                matched = true
                matchResult = { ...resyMatch, platform: 'Resy' }
              } else if (resyResults.length > 0) {
                console.log(`[Resolve] No fuzzy match for "${query}" in: ${resyResults.map(r => r.name).join(', ')}`)
              }
            }
          }
        } catch (err) {
          console.log(`[Resolve] Resy search failed for "${query}": ${err.message}`)
        }
      }

      // 3. Search Tock (needs session + headless)
      if (!matched) {
        try {
          const session = getCredential('Tock')
          if (session) {
            const tockResults = await tockPlatform.searchRestaurants(session, query)
            const tockMatch = tockResults.find(r => fuzzyMatch(query, r.name))
            if (tockMatch) {
              matched = true
              matchResult = { ...tockMatch, platform: 'Tock' }
            }
          }
        } catch (err) {
          console.log(`[Resolve] Tock search failed for "${query}": ${err.message}`)
        }
      }

      if (matched && matchResult) {
        const releaseOverride = RELEASE_OVERRIDES[normalizeName(query)]
        const releaseSchedule = releaseOverride || PLATFORM_DEFAULTS[matchResult.platform] || null

        updateRestaurantPlatform(restaurant.id, {
          platform: matchResult.platform,
          url: matchResult.url || null,
          venue_id: matchResult.venue_id || null,
          image_url: matchResult.image_url || restaurant.image_url || null,
          reservation_release: releaseSchedule
        })

        results.push({ id: restaurant.id, name: query, platform: matchResult.platform, url: matchResult.url, status: 'resolved' })
        resolved++
        sendProgress(i + 1, unknowns.length, query, `resolved → ${matchResult.platform}`)
      } else {
        results.push({ id: restaurant.id, name: query, status: 'not_found' })
        sendProgress(i + 1, unknowns.length, query, 'not found')
      }

      // Rate limit delay between searches
      if (i < unknowns.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return { success: true, resolved, total: unknowns.length, results }
  })

  // Instant Book Now
  ipcMain.handle('resy:book-now', async (_, { restaurant_id, config_id, date, party_size, time }) => {
    try {
      const restaurant = getRestaurantById(restaurant_id)
      if (!restaurant) return { success: false, error: 'Restaurant not found' }

      const session = getCredential('Resy')
      if (!session) return { success: false, error: 'No Resy credentials found' }

      const authToken = resyPlatform.extractResyToken(session)
      if (!authToken) return { success: false, error: 'Could not extract auth token' }

      setSessionCookies(session)

      const [bookToken, paymentMethodId] = await Promise.all([
        getBookingDetails(authToken, config_id, date, party_size),
        getPaymentMethod(authToken)
      ])
      if (!bookToken) return { success: false, error: 'Could not get booking details — slot may no longer be available', conflict: true }

      const result = await bookReservation(authToken, bookToken, paymentMethodId)
      console.log(`[Book Now] bookReservation returned:`, JSON.stringify(result).slice(0, 500))

      if (result.success) {
        createBookingRecord({
          watch_job_id: null,
          restaurant: restaurant.name,
          date,
          time,
          party_size,
          platform: 'Resy',
          status: 'success',
          confirmation_code: result.confirmation_code || null,
          attempt_log: 'Instant book via availability check',
          error_details: null
        })
        notifyBookingSuccess(restaurant.name, date, time, result.confirmation_code)
        return { success: true, confirmation_code: result.confirmation_code }
      }

      return { success: false, error: 'Booking request failed' }
    } catch (err) {
      const errMsg = err.message || 'Booking failed'
      console.error(`[Book Now] ERROR: ${errMsg}`, err.statusCode ? `(HTTP ${err.statusCode})` : '')
      const conflict = /(taken|unavailable|no longer|already.*booked|slot.*gone)/i.test(errMsg)

      createBookingRecord({
        watch_job_id: null,
        restaurant: (getRestaurantById(restaurant_id) || {}).name || 'Unknown',
        date,
        time,
        party_size,
        platform: 'Resy',
        status: 'failed',
        confirmation_code: null,
        attempt_log: 'Instant book attempt failed',
        error_details: errMsg
      })

      return { success: false, error: errMsg, conflict }
    }
  })
}

async function validateCredentials() {
  const results = {}

  // Validate Resy
  const resySession = getCredential('Resy')
  if (resySession) {
    const result = await validateResySession(resySession, resyPlatform.extractResyToken, setSessionCookies)
    results.Resy = result
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('credentials:status-update', { platform: 'Resy', ...result })
    }
  } else {
    results.Resy = { valid: false, reason: 'Not configured' }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('credentials:status-update', { platform: 'Resy', valid: false, reason: 'Not configured' })
    }
  }

  // Validate Tock
  const tockSession = getCredential('Tock')
  if (tockSession) {
    const result = await tockPlatform.validateSession(tockSession)
    if (result.valid) markValidated('Tock')
    results.Tock = result
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('credentials:status-update', { platform: 'Tock', ...result })
    }
  } else {
    results.Tock = { valid: false, reason: 'Not configured' }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('credentials:status-update', { platform: 'Tock', valid: false, reason: 'Not configured' })
    }
  }

  return results
}

app.whenReady().then(() => {
  const dbPath = initDatabase()
  console.log('Database initialized at:', dbPath)

  seedRestaurants(getDatabase())

  registerIpcHandlers()
  createWindow()

  setNotificationWindow(mainWindow)
  createTray(mainWindow)

  startScheduler(mainWindow)

  // Validate saved credentials on startup (fire-and-forget)
  validateCredentials().catch(err => {
    console.error('Startup credential validation failed:', err.message)
  })

  // Fetch missing restaurant images in background
  const missing = getRestaurantsWithoutImages()
  if (missing.length > 0) {
    console.log(`Fetching images for ${missing.length} restaurants in background...`)
    fetchAllMissingImages(missing, updateRestaurantImage, (done, total, name) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('images:progress', { done, total, name })
      }
    }).then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('images:complete')
      }
    })
  }

  // Fetch missing Google ratings/URLs in background
  const missingGoogle = getRestaurantsWithoutGoogleData()
  if (missingGoogle.length > 0) {
    console.log(`Fetching Google data for ${missingGoogle.length} restaurants in background...`)
    fetchAllMissingGoogleData(missingGoogle, updateRestaurantGoogleData, (done, total, name) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('google:progress', { done, total, name })
      }
    }).then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('google:complete')
      }
    })
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', async () => {
  // On Windows, don't quit when all windows are closed if tray is active
  // The 'close' handler on mainWindow hides instead of closing
})

app.on('quit', async () => {
  stopScheduler()
  destroyTray()
  await Promise.allSettled([
    resyPlatform.closeBrowser(),
    tockPlatform.closeBrowser(),
    opentablePlatform.closeBrowser()
  ])
  closeDatabase()
})
