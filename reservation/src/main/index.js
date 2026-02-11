import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { initDatabase, getRestaurants, getWatchJobs, getBookingHistory, createWatchJob, updateWatchJob, cancelWatchJob, getDatabase, closeDatabase, getRestaurantsWithoutImages, updateRestaurantImage } from './database.js'
import { seedRestaurants } from './seed-data.js'
import { fetchAllMissingImages } from './image-fetcher.js'
import { saveCredential, getCredential, deleteCredential, getAllCredentialStatuses, markValidated } from './credentials.js'
import { startScheduler, stopScheduler, getSchedulerStatus, resumeJob } from './scheduler.js'
import { setNotificationWindow } from './notifications.js'
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
