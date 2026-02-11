import { Notification, shell } from 'electron'

let mainWindow = null

export function setNotificationWindow(window) {
  mainWindow = window
}

function focusApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

export function notifyBookingSuccess(restaurantName, date, time, confirmationCode) {
  const notification = new Notification({
    title: 'Reservation Booked!',
    body: `${restaurantName} on ${date} at ${time}${confirmationCode ? `\nConfirmation: ${confirmationCode}` : ''}`,
    silent: false
  })

  notification.on('click', focusApp)
  notification.show()
  shell.beep()
}

export function notifyBookingFailed(restaurantName, errorMsg) {
  const notification = new Notification({
    title: 'Booking Failed',
    body: `${restaurantName}: ${errorMsg}`,
    silent: true
  })

  notification.on('click', focusApp)
  notification.show()
}

export function notifyCaptchaRequired(restaurantName) {
  const notification = new Notification({
    title: 'CAPTCHA Required',
    body: `${restaurantName} requires manual verification. Monitoring paused.`,
    silent: false,
    urgency: 'critical'
  })

  notification.on('click', focusApp)
  notification.show()
  shell.beep()
}
