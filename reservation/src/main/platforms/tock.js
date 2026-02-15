import { chromium } from 'playwright'
import { shell } from 'electron'
import { findAvailability as scrapeAvailability, extractSlug, buildSearchUrl, formatTimeForUrl, searchRestaurants as scrapeSearch } from './tock-scraper.js'

const LOGIN_URL = 'https://www.exploretock.com/login'

let browserInstance = null

// Persistent headless context for availability checking (reused across scheduler ticks)
let headlessContext = null
let headlessContextTimer = null
const CONTEXT_IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export async function closeBrowser() {
  if (headlessContextTimer) {
    clearTimeout(headlessContextTimer)
    headlessContextTimer = null
  }
  if (headlessContext) {
    await headlessContext.close().catch(() => {})
    headlessContext = null
  }
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

    // Wait for the user to complete login (up to 5 minutes)
    // Success: URL navigates away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 300000 })

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

/**
 * Get or create a persistent headless browser context seeded with the saved Tock session.
 * Reused across multiple availability checks. Closes after 5 minutes of inactivity.
 */
async function getOrCreateHeadlessContext(session) {
  // Reset idle timer
  if (headlessContextTimer) clearTimeout(headlessContextTimer)
  headlessContextTimer = setTimeout(async () => {
    if (headlessContext) {
      await headlessContext.close().catch(() => {})
      headlessContext = null
      console.log('[Tock] Headless context closed (idle timeout)')
    }
  }, CONTEXT_IDLE_TIMEOUT_MS)

  if (headlessContext) return headlessContext

  // Ensure browser is running
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    })
  }

  headlessContext = await browserInstance.newContext({
    storageState: session.storage
  })
  if (session.cookies?.length) {
    await headlessContext.addCookies(session.cookies)
  }

  console.log('[Tock] Headless context created')
  return headlessContext
}

/**
 * Search Tock for restaurants matching a query.
 * Uses the persistent headless browser context.
 */
export async function searchRestaurants(session, query) {
  const context = await getOrCreateHeadlessContext(session)
  return scrapeSearch(context, query)
}

/**
 * Check availability for a Tock restaurant by scraping the search page.
 * Returns array of { time, config_id, type } matching the Resy slot format.
 */
export async function checkAvailability(session, tockUrl, date, partySize) {
  const slug = extractSlug(tockUrl)
  if (!slug) throw new Error(`Cannot parse Tock URL: ${tockUrl}`)

  const context = await getOrCreateHeadlessContext(session)
  return scrapeAvailability(context, slug, date, partySize)
}

/**
 * Open the Tock booking page in the user's default browser.
 * Phase 1: manual completion (Tock has Braintree payment + Cloudflare Turnstile).
 */
export async function bookSlot(session, tockUrl, date, partySize, time) {
  const slug = extractSlug(tockUrl)
  if (!slug) throw new Error(`Cannot parse Tock URL: ${tockUrl}`)

  const tockTime = formatTimeForUrl(time)
  const bookingUrl = buildSearchUrl(slug, date, partySize, tockTime)

  console.log(`[Tock] Opening booking page: ${bookingUrl}`)
  await shell.openExternal(bookingUrl)

  return {
    success: true,
    opened_in_browser: true,
    url: bookingUrl,
    message: 'Opened Tock booking page in your browser. Complete the booking there.'
  }
}
