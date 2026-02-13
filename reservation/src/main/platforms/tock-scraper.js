const TOCK_BASE = 'https://www.exploretock.com'

/**
 * Extract the URL slug from a Tock restaurant URL.
 * "https://www.exploretock.com/atera" → "atera"
 */
export function extractSlug(tockUrl) {
  const match = tockUrl.match(/exploretock\.com\/([^/?#]+)/)
  return match ? match[1] : null
}

/**
 * Build the Tock search URL for a given restaurant, date, party size, and optional time.
 */
export function buildSearchUrl(slug, date, partySize, time) {
  const params = new URLSearchParams({
    date,
    size: String(partySize)
  })
  if (time) params.set('time', time)
  return `${TOCK_BASE}/${slug}/search?${params}`
}

/**
 * Find available time slots on Tock for a given restaurant/date/party.
 * Requires a Playwright BrowserContext (with or without auth — availability is public).
 * Returns array of { time, config_id, type } matching the Resy slot format.
 */
export async function findAvailability(context, slug, date, partySize) {
  const page = await context.newPage()
  try {
    const url = buildSearchUrl(slug, date, partySize)
    console.log(`[Tock] Navigating to: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Wait for search results to render (Tock is a React SPA)
    await page.waitForSelector(
      '[data-testid="search-result-time"], .Consumer-resultsListItem, .SearchResults, [class*="search-result"], [class*="SearchResult"]',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Tock] No result selectors found — page may have no availability')
    })

    // Extra settle time for React rendering
    await new Promise(r => setTimeout(r, 2000))

    // Extract slots from the DOM using multiple selector strategies
    const slots = await page.evaluate(() => {
      const results = []

      // Strategy 1: Modern data-testid selectors (tockstalk pattern)
      const testIdSlots = document.querySelectorAll('[data-testid="search-result-time"]')
      if (testIdSlots.length > 0) {
        testIdSlots.forEach((el, index) => {
          const timeText = el.textContent?.trim()
          const container = el.closest('[data-testid*="search-result"]') || el.parentElement
          const typeEl = container?.querySelector('[data-testid*="experience"], [class*="experience"], [class*="EventName"]')
          const type = typeEl?.textContent?.trim() || ''
          if (timeText) {
            results.push({ time: timeText, config_id: `tock_${index}_${timeText.replace(/\s+/g, '')}`, type })
          }
        })
        return results
      }

      // Strategy 2: Legacy CSS class selectors (reserve-tfl pattern)
      const legacySlots = document.querySelectorAll('button.Consumer-resultsListItem.is-available, .Consumer-resultsListItem.is-available')
      if (legacySlots.length > 0) {
        legacySlots.forEach((el, index) => {
          const timeEl = el.querySelector('.Consumer-resultsListItemTime, [class*="Time"], span')
          const timeText = timeEl?.textContent?.trim() || el.textContent?.trim()
          if (timeText) {
            results.push({ time: timeText, config_id: `tock_${index}_${timeText.replace(/\s+/g, '')}`, type: '' })
          }
        })
        return results
      }

      // Strategy 3: Broad fallback — any clickable element with time-like text in search results
      const searchArea = document.querySelector('[class*="SearchResult"], [class*="search-result"], [class*="Results"], main, [role="main"]') || document.body
      const allButtons = searchArea.querySelectorAll('button, [role="button"], a')
      const timePattern = /^\d{1,2}:\d{2}\s*(AM|PM)$/i
      allButtons.forEach((el, index) => {
        const text = el.textContent?.trim()
        if (text && timePattern.test(text)) {
          results.push({ time: text, config_id: `tock_${index}_${text.replace(/\s+/g, '')}`, type: '' })
        }
      })

      return results
    })

    console.log(`[Tock] Found ${slots.length} available slots for ${slug} on ${date}`)
    return slots
  } finally {
    await page.close()
  }
}

/**
 * Format a display time string for Tock URL parameter.
 * "6:30 PM" → "18:30"
 */
export function formatTimeForUrl(displayTime) {
  const match = displayTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let [, hours, minutes, period] = match
  hours = parseInt(hours, 10)
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0
  return `${String(hours).padStart(2, '0')}:${minutes}`
}
