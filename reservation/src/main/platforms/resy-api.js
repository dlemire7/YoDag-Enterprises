const BASE_URL = 'https://api.resy.com'
const API_KEY = 'VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5'

function headers(authToken) {
  return {
    'Authorization': `ResyAPI api_key="${API_KEY}"`,
    'X-Resy-Auth-Token': authToken,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  }
}

/**
 * Extract the Resy auth token from a saved Playwright session's localStorage.
 * The session shape is: { cookies, storage: { cookies, origins: [{ origin, localStorage: [{ name, value }] }] } }
 */
export function extractAuthToken(session) {
  const origins = session?.storage?.origins || []
  for (const origin of origins) {
    for (const entry of origin.localStorage || []) {
      // Resy stores the auth token under a key containing 'authToken' or 'auth_token'
      if (/auth.?token/i.test(entry.name)) {
        return entry.value
      }
    }
  }
  // Fallback: look for a JSON blob that contains a token field
  for (const origin of origins) {
    for (const entry of origin.localStorage || []) {
      try {
        const parsed = JSON.parse(entry.value)
        if (parsed?.token) return parsed.token
        if (parsed?.auth_token) return parsed.auth_token
      } catch { /* not JSON */ }
    }
  }
  return null
}

/**
 * Resolve a Resy restaurant URL slug to a numeric venue_id.
 * Tries the venue lookup API first, falls back to scraping the page.
 */
export async function resolveVenueId(authToken, url) {
  // Extract slug from URL like https://resy.com/cities/ny/laser-wolf
  const match = url.match(/resy\.com\/cities\/([^/]+)\/([^/?#]+)/)
  if (!match) throw new Error(`Cannot parse Resy URL: ${url}`)

  const [, city, slug] = match

  // Try the venue search/lookup endpoint
  try {
    const searchUrl = `${BASE_URL}/3/venue?url_slug=${slug}&location=${city}`
    const res = await fetch(searchUrl, { headers: headers(authToken) })
    if (res.ok) {
      const data = await res.json()
      const venueId = data?.id?.resy
      if (venueId) return String(venueId)
    }
  } catch { /* fallback below */ }

  // Fallback: fetch the restaurant page and extract venue_id from embedded data
  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    })
    const html = await pageRes.text()
    // Look for venue_id in the page source
    const idMatch = html.match(/"venue_id"\s*:\s*(\d+)/) || html.match(/"id"\s*:\s*(\d+).*?"resy"/)
    if (idMatch) return idMatch[1]
  } catch { /* give up */ }

  throw new Error(`Could not resolve venue_id for ${url}`)
}

/**
 * Find available reservation slots for a given venue, date, and party size.
 * Returns array of { time, config_id, type } objects.
 */
export async function findAvailability(authToken, venueId, date, partySize) {
  const params = new URLSearchParams({
    venue_id: venueId,
    day: date,
    party_size: String(partySize),
    lat: '0',
    long: '0'
  })

  const res = await fetch(`${BASE_URL}/4/find?${params}`, {
    headers: headers(authToken)
  })

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Session expired'), { statusCode: res.status })
  }
  if (res.status === 429) {
    throw Object.assign(new Error('Rate limited'), { statusCode: 429 })
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Resy API error: ${res.status}`), { statusCode: res.status })
  }

  const data = await res.json()
  const slots = []

  // The response nests slots under results.venues[].slots[]
  const venues = data?.results?.venues || []
  for (const venue of venues) {
    for (const slot of venue.slots || []) {
      const config = slot.config || {}
      const time = slot.date?.start
      if (time && config.token) {
        slots.push({
          time: formatTime(time),
          config_id: config.token,
          type: config.type || 'Dining Room'
        })
      }
    }
  }

  return slots
}

/**
 * Get booking details / book_token for a specific slot.
 */
export async function getBookingDetails(authToken, configId, day, partySize) {
  const body = new URLSearchParams({
    config_id: configId,
    day: day,
    party_size: String(partySize)
  })

  const res = await fetch(`${BASE_URL}/3/details`, {
    method: 'POST',
    headers: headers(authToken),
    body: body.toString()
  })

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Session expired'), { statusCode: res.status })
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Failed to get booking details: ${res.status}`), { statusCode: res.status })
  }

  const data = await res.json()
  return data?.book_token?.value || null
}

/**
 * Get the user's payment method ID.
 */
export async function getPaymentMethod(authToken) {
  const res = await fetch(`${BASE_URL}/2/user`, {
    headers: headers(authToken)
  })

  if (!res.ok) {
    throw Object.assign(new Error(`Failed to get user info: ${res.status}`), { statusCode: res.status })
  }

  const data = await res.json()
  const methods = data?.payment_methods || data?.payment_method_id
  if (Array.isArray(methods) && methods.length > 0) {
    return methods[0].id
  }
  if (typeof methods === 'number' || typeof methods === 'string') {
    return methods
  }
  return null
}

/**
 * Book a reservation using a book_token and payment method.
 */
export async function bookReservation(authToken, bookToken, paymentMethodId) {
  const body = new URLSearchParams({
    book_token: bookToken
  })
  if (paymentMethodId) {
    body.set('struct_payment_method', JSON.stringify({ id: paymentMethodId }))
  }

  const res = await fetch(`${BASE_URL}/3/book`, {
    method: 'POST',
    headers: headers(authToken),
    body: body.toString()
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(
      new Error(`Booking failed: ${res.status} ${text}`),
      { statusCode: res.status }
    )
  }

  const data = await res.json()
  return {
    success: true,
    confirmation_code: data?.resy_token || data?.reservation_id || null,
    details: data
  }
}

/**
 * Convert an ISO datetime or time string to a display format like "7:00 PM"
 */
function formatTime(isoTime) {
  try {
    const date = new Date(isoTime)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return isoTime
  }
}
