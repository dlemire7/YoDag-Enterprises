import { Tray, Menu, nativeImage, app } from 'electron'
import { getActiveWatchJobs } from './database.js'

let tray = null
let mainWindow = null

export function createTray(window) {
  mainWindow = window

  // Create a simple 16x16 gold-colored icon using nativeImage
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('NYC Elite Reservations')

  updateContextMenu()

  tray.on('double-click', () => {
    showWindow()
  })

  return tray
}

export function updateContextMenu() {
  if (!tray) return

  let activeCount = 0
  try {
    activeCount = getActiveWatchJobs().length
  } catch { /* db may not be ready */ }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NYC Elite Reservations',
      click: showWindow
    },
    { type: 'separator' },
    {
      label: `Monitoring: ${activeCount} active job${activeCount !== 1 ? 's' : ''}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTrayIcon() {
  // Create a 16x16 RGBA buffer with a gold diamond shape
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.abs(x - 7.5)
      const cy = Math.abs(y - 7.5)
      if (cx + cy <= 7) {
        const idx = (y * size + x) * 4
        buf[idx] = 0xd4     // R (gold)
        buf[idx + 1] = 0xaf // G
        buf[idx + 2] = 0x37 // B
        buf[idx + 3] = 0xff // A
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

export { createTrayIcon as createAppIcon }
