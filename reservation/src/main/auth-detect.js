/**
 * Shared auth detection — polls both cookies (via Playwright context) and
 * localStorage/DOM (via page) for signs of a completed login.
 * Waits for the page to settle before baselining, so analytics cookies
 * don't cause false positives.
 */
export function waitForLogin(context, page, timeoutMs = 300000) {
  return new Promise(async (resolve, reject) => {
    // Let the page fully load and set its initial cookies
    await new Promise(r => setTimeout(r, 10000))

    const initialCookies = new Set((await context.cookies()).map(c => c.name))
    const initialStorageCount = await page.evaluate(() => {
      try { return localStorage.length } catch { return 0 }
    }).catch(() => 0)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error('Sign-in timed out'))
    }, timeoutMs)

    const interval = setInterval(async () => {
      try {
        // Check 1: New auth-related cookies
        const currentCookies = await context.cookies()
        const newCookies = currentCookies.filter(c => !initialCookies.has(c.name))
        const hasAuthCookie = newCookies.some(c =>
          /auth|jwt|id_token|access_token|logged.?in|secure.?ot/i.test(c.name)
        )
        if (hasAuthCookie || newCookies.length >= 8) {
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
          return
        }

        // Check 2: localStorage auth tokens or DOM logged-in indicators
        const loggedIn = await page.evaluate((initCount) => {
          try {
            // Check for auth-related localStorage keys
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (/auth|token|jwt|user/i.test(key) && localStorage.getItem(key)) {
                return true
              }
            }
            // Check for significant new localStorage entries (login session data)
            if (localStorage.length >= initCount + 3) return true
          } catch {}
          return false
        }, initialStorageCount).catch(() => false)

        if (loggedIn) {
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
        }
      } catch {
        clearInterval(interval)
        clearTimeout(timeout)
        reject(new Error('Target closed'))
      }
    }, 2000)
  })
}
