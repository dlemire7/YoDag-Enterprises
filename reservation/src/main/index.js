import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { initDatabase, getRestaurants, getWatchJobs, getBookingHistory, createWatchJob, updateWatchJob, cancelWatchJob, getDatabase, closeDatabase } from './database.js'
import { seedRestaurants } from './seed-data.js'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    title: 'NYC Elite Reservations',
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
    return createWatchJob(data)
  })

  ipcMain.handle('db:update-watch-job', async (_, id, fields) => {
    return updateWatchJob(id, fields)
  })

  ipcMain.handle('db:delete-watch-job', async (_, id) => {
    return cancelWatchJob(id)
  })

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion()
  })
}

app.whenReady().then(() => {
  const dbPath = initDatabase()
  console.log('Database initialized at:', dbPath)

  seedRestaurants(getDatabase())

  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  closeDatabase()
  app.quit()
})
