import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { initDatabase, getRestaurants, getWatchJobs, getBookingHistory, createWatchJob, updateWatchJob, cancelWatchJob, getDatabase, closeDatabase, getRestaurantsWithoutImages, updateRestaurantImage, getRestaurantById, updateRestaurantVenueId, createBookingRecord, createRestaurant } from './database.js'
import { seedRestaurants } from './seed-data.js'
import { fetchAllMissingImages, fetchImageForRestaurant } from './image-fetcher.js'
import { saveCredential, getCredential, deleteCredential, getAllCredentialStatuses, markValidated } from './credentials.js'
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
    try {
      if (platform === 'Resy') {
        const session = getCredential('Resy')
        if (!session) return { success: false, noCredentials: true }
        const authToken = resyPlatform.extractResyToken(session)
        if (!authToken) return { success: false, sessionExpired: true, error: 'Could not extract auth token' }
        setSessionCookies(session)
        const results = await searchVenues(authToken, query)
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
        return { success: false, duplicate: true, id: result.id }
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

app.whenReady().then(() => {
  const dbPath = initDatabase()
  console.log('Database initialized at:', dbPath)

  seedRestaurants(getDatabase())

  registerIpcHandlers()
  createWindow()

  setNotificationWindow(mainWindow)
  createTray(mainWindow)

  startScheduler(mainWindow)

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
