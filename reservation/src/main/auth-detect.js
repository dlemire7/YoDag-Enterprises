/**
 * Shared auth detection — polls cookies, localStorage, and DOM for signs
 * of a completed login. Captures baseline state after the page loads,
 * then detects meaningful changes that indicate authentication.
 */
export function waitForLogin(context, page, timeoutMs = 300000) {
  return new Promise(async (resolve, reject) => {
    // Let the page fully load and set its initial cookies / storage
    await new Promise(r => setTimeout(r, 8000))

    const initialCookieNames = new Set((await context.cookies()).map(c => c.name))
    const initialStorageKeys = await page.evaluate(() => {
      try {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i))
        }
        return keys
      } catch { return [] }
    }).catch(() => [])

    console.log('[Auth Detect] Baseline captured —',
      initialCookieNames.size, 'cookies,',
      initialStorageKeys.length, 'localStorage keys')

    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error('Sign-in timed out'))
    }, timeoutMs)

    const interval = setInterval(async () => {
      try {
        // ── Check 1: New auth-related cookies ──
        const currentCookies = await context.cookies()
        const newCookies = currentCookies.filter(c => !initialCookieNames.has(c.name))
        if (newCookies.length > 0) {
          const authCookie = newCookies.some(c =>
            /auth|jwt|id_token|access_token|logged.?in|secure.?ot|session|_resy|_tock|_ot_/i.test(c.name)
          )
          if (authCookie || newCookies.length >= 5) {
            console.log('[Auth Detect] Login detected via cookies —',
              newCookies.map(c => c.name).join(', '))
            clearInterval(interval)
            clearTimeout(timeout)
            resolve()
            return
          }
        }

        // ── Check 2: New auth-related localStorage keys ──
        const storageResult = await page.evaluate((baselineKeys) => {
          try {
            const baseSet = new Set(baselineKeys)
            const newKeys = []
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (!baseSet.has(key)) newKeys.push(key)
            }

            // Check if any NEW key looks auth-related
            const authKey = newKeys.find(k =>
              /auth|token|jwt|user|session|credential/i.test(k)
            )
            if (authKey) return { detected: 'new_auth_key', detail: authKey }

            // Significant new localStorage entries (login data burst)
            if (newKeys.length >= 3) return { detected: 'storage_growth', detail: newKeys.join(', ') }

            // Check ALL localStorage values for auth tokens (Resy stores
            // token inside JSON blobs where the key may not match patterns)
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              // Direct auth token key
              if (/auth.?token/i.test(key) && localStorage.getItem(key)) {
                // Only flag if this key is new or its value changed
                if (!baseSet.has(key)) return { detected: 'auth_token_key', detail: key }
              }
              // JSON blob with token inside
              try {
                const val = JSON.parse(localStorage.getItem(key))
                if (val && typeof val === 'object') {
                  if (val.token || val.auth_token || val.authToken || val.access_token) {
                    if (!baseSet.has(key)) return { detected: 'json_token', detail: key }
                  }
                }
              } catch { /* not JSON */ }
            }
          } catch {}
          return null
        }, initialStorageKeys).catch(() => null)

        if (storageResult) {
          console.log('[Auth Detect] Login detected via localStorage —',
            storageResult.detected, ':', storageResult.detail)
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
          return
        }

        // ── Check 3: DOM indicators of logged-in state ──
        const domLoggedIn = await page.evaluate(() => {
          try {
            // Common logged-in UI patterns: avatar, account menu, sign-out link
            const selectors = [
              '[data-testid*="avatar"]',
              '[data-testid*="account"]',
              '[class*="avatar"]',
              '[class*="user-menu"]',
              '[class*="AccountMenu"]',
              '[class*="UserIcon"]',
              'a[href*="/account"]',
              'a[href*="/profile"]',
              'button[aria-label*="account" i]',
              'button[aria-label*="profile" i]',
            ]
            for (const sel of selectors) {
              if (document.querySelector(sel)) return sel
            }
            // Check for "Sign Out" / "Log Out" text in nav-like elements
            const navEls = document.querySelectorAll('nav, header, [role="navigation"]')
            for (const el of navEls) {
              if (/sign\s*out|log\s*out|my\s*account/i.test(el.textContent)) {
                return 'nav_text'
              }
            }
          } catch {}
          return null
        }).catch(() => null)

        if (domLoggedIn) {
          // Wait a beat for the page to settle (token storage may lag behind UI)
          await new Promise(r => setTimeout(r, 2000))
          console.log('[Auth Detect] Login detected via DOM —', domLoggedIn)
          clearInterval(interval)
          clearTimeout(timeout)
          resolve()
          return
        }
      } catch (err) {
        // If the page navigated (e.g. OAuth redirect), the evaluate calls
        // throw — that's expected, just keep polling until the page comes back
        if (err.message?.includes('Target closed') || err.message?.includes('destroyed')) {
          clearInterval(interval)
          clearTimeout(timeout)
          reject(new Error('Target closed'))
        }
        // Otherwise keep polling — page may be mid-navigation
      }
    }, 2000)
  })
}
