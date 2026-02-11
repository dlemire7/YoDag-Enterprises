import { chromium } from 'playwright'
import { waitForLogin } from '../auth-detect.js'
import { extractAuthToken, findAvailability, getBookingDetails, getPaymentMethod, bookReservation } from './resy-api.js'

const LOGIN_URL = 'https://resy.com/'

let browserInstance = null

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
}

export async function browserLogin() {
  await closeBrowser()

  browserInstance = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  })

  const context = await browserInstance.newContext({
    viewport: { width: 1100, height: 800 }
  })
  const page = await context.newPage()

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Wait for user to complete login — detect new cookies or localStorage tokens
    await waitForLogin(context, page)

    const cookies = await context.cookies()
    const storageState = await context.storageState()

    await context.close()
    await closeBrowser()

    return {
      success: true,
      session: { cookies, storage: storageState }
    }
  } catch (err) {
    await context.close().catch(() => {})
    await closeBrowser()

    if (err.message.includes('timeout') || err.message.includes('Target closed')) {
      return { success: false, error: 'Sign-in timed out — the browser was closed or login was not completed' }
    }
    return { success: false, error: err.message }
  }
}

// Load a previously saved session into a new browser context
export async function createAuthenticatedContext(session) {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    })
  }
  const context = await browserInstance.newContext({
    storageState: session.storage
  })
  // Re-add cookies that may not be in storageState
  if (session.cookies?.length) {
    await context.addCookies(session.cookies)
  }
  return context
}

export async function checkAvailability(session, venueId, date, partySize) {
  const authToken = extractAuthToken(session)
  if (!authToken) throw new Error('No auth token found in session')
  return findAvailability(authToken, venueId, date, partySize)
}

export async function bookSlot(session, configId, day, partySize) {
  const authToken = extractAuthToken(session)
  if (!authToken) throw new Error('No auth token found in session')

  const bookToken = await getBookingDetails(authToken, configId, day, partySize)
  if (!bookToken) throw new Error('Failed to obtain book_token')

  const paymentId = await getPaymentMethod(authToken)
  return bookReservation(authToken, bookToken, paymentId)
}
