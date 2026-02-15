import { chromium } from 'playwright'
import { extractAuthToken, getBookingDetails, getPaymentMethod, bookReservation } from './resy-api.js'

const LOGIN_URL = 'https://resy.com/'

let browserInstance = null

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
}

/**
 * Install a network response listener that captures Resy auth tokens
 * from API responses.  Returns a holder object whose .token property
 * is updated when a token is found.
 */
function installTokenCapture(page) {
  const holder = { token: null }

  page.on('response', async (response) => {
    try {
      const url = response.url()
      if (!url.includes('api.resy.com') || response.status() !== 200) return

      // Check response headers for auth token
      const headers = response.headers()
      const headerToken = headers['x-resy-auth-token']
      if (headerToken && headerToken.length > 10) {
        holder.token = headerToken
        console.log('[Resy Auth] Token captured from response header:', url.replace(/\?.*/, ''))
        return
      }

      const contentType = headers['content-type'] || ''
      if (!contentType.includes('json')) return

      const body = await response.json().catch(() => null)
      if (!body) return

      // Log auth-related API calls for debugging
      if (/auth|login|sign.?in|session|user/i.test(url)) {
        const keys = Object.keys(body)
        console.log('[Resy Auth] API response:', url.replace(/\?.*/, ''), '— keys:', keys.join(', '))
      }

      // Search for token at top level and one level deep
      const token = findToken(body)
      if (token) {
        holder.token = token
        console.log('[Resy Auth] Token captured from response body:', url.replace(/\?.*/, ''))
      }
    } catch { /* response may have been disposed */ }
  })

  return holder
}

/** Recursively search (up to 2 levels) for a value that looks like an auth token */
function findToken(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 2) return null

  // Direct key matches
  for (const key of Object.keys(obj)) {
    if (/^(token|auth_token|authToken|access_token|auth\.token|resy_token)$/i.test(key)) {
      const val = obj[key]
      if (typeof val === 'string' && val.length > 10) return val
    }
  }

  // Recurse into nested objects
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findToken(val, depth + 1)
      if (found) return found
    }
  }

  return null
}

/**
 * Resy-specific login detection.
 *
 * Resy is an SPA — login happens in a modal, the URL never changes.
 * After login the "Log In" button in the nav is replaced by an avatar icon.
 *
 * Resy does NOT store the auth token in cookies or localStorage — it lives
 * only in JS memory.  We capture it via network interception (see above).
 *
 * Detection layers:
 *   1. Network intercept: token holder already has a token
 *   2. DOM: avatar appears OR "Log In" link disappears from nav
 */
function waitForResyAuth(page, tokenHolder, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    let sawLogInLink = false

    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error('Sign-in timed out'))
    }, timeoutMs)

    const interval = setInterval(async () => {
      try {
        // ── Check 1: Did we capture a token from the network? ──
        if (tokenHolder.token) {
          console.log('[Resy Auth] Login confirmed — token captured via network intercept')
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
          return
        }

        // ── Check 2: DOM-based detection ──
        const domResult = await page.evaluate(() => {
          try {
            if (!location.hostname.includes('resy')) return null

            // Look for avatar / account elements that only exist when logged in
            const avatarSelectors = [
              '[class*="Avatar"]', '[class*="avatar"]',
              '[data-test*="avatar"]', '[data-test*="account"]',
              '[data-testid*="avatar"]', '[data-testid*="account"]',
              'a[href*="/account"]', 'a[href*="/profile"]',
              'button[aria-label*="account" i]',
              'button[aria-label*="profile" i]',
              '[class*="UserIcon"]', '[class*="userIcon"]',
              '[class*="ProfileIcon"]', '[class*="profileIcon"]',
            ]
            for (const sel of avatarSelectors) {
              if (document.querySelector(sel)) return { method: 'avatar', detail: sel }
            }

            // Check nav/header for "Log In" link
            const header = document.querySelector('header, nav, [role="banner"], [class*="Nav"], [class*="nav"]')
            if (header) {
              const links = header.querySelectorAll('a, button')
              let hasLogIn = false
              for (const link of links) {
                if (/^log\s*in$/i.test(link.textContent?.trim() || '')) {
                  hasLogIn = true
                  break
                }
              }
              return hasLogIn
                ? { method: 'has_login_link' }
                : (links.length > 0 ? { method: 'no_login_link' } : null)
            }
          } catch {}
          return null
        }).catch(() => null)

        if (domResult) {
          if (domResult.method === 'avatar') {
            await new Promise(r => setTimeout(r, 3000))
            console.log('[Resy Auth] Login detected via DOM — avatar element found:', domResult.detail)
            clearInterval(interval)
            clearTimeout(timeout)
            resolve()
            return
          }
          if (domResult.method === 'has_login_link') {
            if (!sawLogInLink) {
              sawLogInLink = true
              console.log('[Resy Auth] Page loaded — "Log In" link visible, waiting for login...')
            }
          }
          if (domResult.method === 'no_login_link' && sawLogInLink) {
            // "Log In" was visible before but is now gone — user logged in
            await new Promise(r => setTimeout(r, 3000))
            console.log('[Resy Auth] Login detected via DOM — "Log In" link disappeared')
            clearInterval(interval)
            clearTimeout(timeout)
            resolve()
            return
          }
        }
      } catch (err) {
        if (err.message?.includes('Target closed') || err.message?.includes('destroyed')) {
          clearInterval(interval)
          clearTimeout(timeout)
          reject(new Error('Target closed'))
        }
      }
    }, 2000)
  })
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

  // Single network listener shared between detection and session capture
  const tokenHolder = installTokenCapture(page)

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log('[Resy Auth] Browser opened — waiting for login...')

    await waitForResyAuth(page, tokenHolder)

    // Extra settle time for any remaining network responses
    await new Promise(r => setTimeout(r, 1500))

    const cookies = await context.cookies()
    const storageState = await context.storageState()

    // Inject the captured token into the storage so extractResyToken() can find it
    if (tokenHolder.token) {
      console.log('[Resy Auth] Injecting captured token into session storage')
      const resyOrigin = storageState.origins?.find(o => o.origin?.includes('resy'))
      if (resyOrigin) {
        resyOrigin.localStorage.push({ name: 'resy_auth_token', value: tokenHolder.token })
      } else {
        storageState.origins.push({
          origin: 'https://resy.com',
          localStorage: [{ name: 'resy_auth_token', value: tokenHolder.token }]
        })
      }
    } else {
      console.log('[Resy Auth] Warning: no auth token captured from API responses — booking may not work')
    }

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

export async function bookSlot(session, configId, day, partySize) {
  const authToken = extractResyToken(session)
  if (!authToken) throw new Error('No auth token found in session')

  const [bookToken, paymentId] = await Promise.all([
    getBookingDetails(authToken, configId, day, partySize),
    getPaymentMethod(authToken)
  ])
  if (!bookToken) throw new Error('Failed to obtain book_token')

  return bookReservation(authToken, bookToken, paymentId)
}

/**
 * Extract auth token from saved session.
 * Checks for our injected resy_auth_token first, then falls back to
 * the generic extractAuthToken patterns from resy-api.js.
 */
export function extractResyToken(session) {
  const origins = session?.storage?.origins || []
  for (const origin of origins) {
    for (const entry of origin.localStorage || []) {
      if (entry.name === 'resy_auth_token' && entry.value) {
        return entry.value
      }
    }
  }
  return extractAuthToken(session)
}
