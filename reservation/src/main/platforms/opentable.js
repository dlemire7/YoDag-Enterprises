import { chromium } from 'playwright'
import { waitForLogin } from '../auth-detect.js'

const LOGIN_URL = 'https://www.opentable.com'

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
  if (session.cookies?.length) {
    await context.addCookies(session.cookies)
  }
  return context
}

// Phase 5 skeleton
export async function checkAvailability(session, restaurantUrl, date, partySize) {
  throw new Error('Not implemented - Phase 5')
}
