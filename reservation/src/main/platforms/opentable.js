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

/**
 * Search OpenTable for restaurants matching a query.
 * Uses the public autocomplete/search API (no auth needed).
 * Returns up to 10 normalized results.
 */
export async function searchRestaurants(query) {
  const url = `https://www.opentable.com/dapi/fe/gql?type=restaurant&term=${encodeURIComponent(query)}&latitude=40.7128&longitude=-74.006&limit=10`

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  })

  if (!res.ok) {
    throw new Error(`OpenTable search error: ${res.status}`)
  }

  const data = await res.json()
  const restaurants = data?.restaurants || data?.items || data?.results || data?.autocomplete?.restaurants || []
  const results = []

  for (const r of (Array.isArray(restaurants) ? restaurants : []).slice(0, 10)) {
    const name = r.name || r.restaurantName || ''
    if (!name) continue

    const neighborhood = r.neighborhood || r.location?.neighborhood || ''
    const cuisine = r.primaryCuisine || r.cuisine || ''
    const slug = r.profileLink || r.urlSlug || r.macroId || ''
    const profileUrl = slug
      ? (slug.startsWith('http') ? slug : `https://www.opentable.com${slug.startsWith('/') ? '' : '/'}${slug}`)
      : ''

    results.push({
      name,
      neighborhood,
      borough: '',
      cuisine,
      platform: 'OpenTable',
      url: profileUrl,
      venue_id: r.rid ? String(r.rid) : null,
      image_url: r.primaryPhoto || r.photos?.[0]?.url || null
    })
  }

  return results
}
