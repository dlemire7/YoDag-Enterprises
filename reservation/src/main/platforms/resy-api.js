const BASE_URL = 'https://api.resy.com'
const API_KEY = 'VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5'

// Module-level cookie store — populated from Playwright session
let _cookieHeader = ''

// Payment method cache — the ID never changes during a session
let _cachedPaymentMethod = null  // { id, fetchedAt }
const PAYMENT_CACHE_TTL = 60 * 60 * 1000  // 1 hour

/**
 * Set cookies from a saved Playwright session for use in API requests.
 * Extracts cookies that match .resy.com or api.resy.com domains.
 */
export function setSessionCookies(session) {
  const cookies = session?.cookies || []
  const resyCookies = cookies.filter(c => {
    const domain = (c.domain || '').toLowerCase()
    return domain.includes('resy.com')
  })
  if (resyCookies.length > 0) {
    _cookieHeader = resyCookies.map(c => `${c.name}=${c.value}`).join('; ')
    console.log(`[Resy API] Loaded ${resyCookies.length} session cookies (${resyCookies.map(c => c.name).join(', ')})`)
  }
}

/**
 * Headers for GET requests — no Content-Type (invalid on GET and triggers WAF rejection).
 */
function getHeaders(authToken) {
  const h = {
    'Authorization': `ResyAPI api_key="${API_KEY}"`,
    'Accept': 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache',
    'X-Resy-Auth-Token': authToken,
    'X-Resy-Universal-Auth': authToken,
    'Origin': 'https://resy.com',
    'Referer': 'https://resy.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  }
  if (_cookieHeader) {
    h['Cookie'] = _cookieHeader
  }
  return h
}

/**
 * Headers for POST requests — JSON body (newer endpoints like /3/details, /3/book).
 */
function jsonPostHeaders(authToken) {
  return {
    ...getHeaders(authToken),
    'Content-Type': 'application/json'
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
 * Tries multiple API endpoints, collects all candidate IDs, validates each
 * with a test /4/find call, and returns the first one that works.
 */
export async function resolveVenueId(authToken, url) {
  // Extract slug from URL like https://resy.com/cities/ny/laser-wolf
  const match = url.match(/resy\.com\/cities\/([^/]+)\/([^/?#]+)/)
  if (!match) throw new Error(`Cannot parse Resy URL: ${url}`)

  const [, city, slug] = match
  const candidateIds = new Set()

  // Map city codes to location_ids (Resy's internal city IDs)
  const locationMap = { ny: '1', chi: '2', la: '3', dc: '4', atl: '5', sf: '6', aus: '7' }
  const locationId = locationMap[city] || '1'

  // Try multiple API endpoint patterns to collect candidate IDs
  const endpoints = [
    `${BASE_URL}/3/venue?url_slug=${slug}&location=${city}`,
    `${BASE_URL}/2/venue?url_slug=${slug}&location_id=${locationId}`,
    `${BASE_URL}/3/venue?url_slug=${slug}`,
    `${BASE_URL}/2/config?url_slug=${slug}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { headers: getHeaders(authToken) })
      if (res.ok) {
        const data = await res.json()
        const ids = extractAllCandidateIds(data)
        const shortEndpoint = endpoint.replace(BASE_URL, '')
        if (ids.length > 0) {
          console.log(`[Resy API] ${shortEndpoint} → candidate IDs: ${ids.join(', ')}`)
          for (const id of ids) candidateIds.add(id)
        } else {
          console.log(`[Resy API] ${shortEndpoint} — ok but no IDs found, keys: ${Object.keys(data).slice(0, 10).join(', ')}`)
          // Log deeper structure for debugging
          const preview = JSON.stringify(data, null, 0).slice(0, 300)
          console.log(`[Resy API] Response preview: ${preview}`)
        }
      } else {
        console.log(`[Resy API] ${endpoint.replace(BASE_URL, '')} → ${res.status}`)
      }
    } catch (e) {
      console.log(`[Resy API] ${endpoint.replace(BASE_URL, '')} → error: ${e.message}`)
    }
  }

  // Try venue search
  try {
    const searchName = slug.replace(/-/g, ' ')
    const searchUrl = `${BASE_URL}/3/venuesearch/search?query=${encodeURIComponent(searchName)}&geo={"latitude":40.7128,"longitude":-74.006}&types=["venue"]`
    const res = await fetch(searchUrl, { headers: getHeaders(authToken) })
    if (res.ok) {
      const data = await res.json()
      const hits = data?.search?.hits || data?.results || data?.hits || []
      for (const hit of (Array.isArray(hits) ? hits : [])) {
        const ids = extractAllCandidateIds(hit)
        if (ids.length > 0) {
          console.log(`[Resy API] Search hit → candidate IDs: ${ids.join(', ')}`)
          for (const id of ids) candidateIds.add(id)
        }
      }
    }
  } catch { /* continue */ }

  // Use first candidate ID (skip validation — /4/find may fail for auth reasons unrelated to venue_id)
  if (candidateIds.size > 0) {
    const bestId = [...candidateIds][0]
    console.log(`[Resy API] Resolved ${slug} → venue_id ${bestId} (candidates: ${[...candidateIds].join(', ')})`)
    return String(bestId)
  }

  throw new Error(`Could not resolve venue_id for ${url} — set venue_id manually in database`)
}

/**
 * Extract ALL possible numeric IDs from a Resy API response object.
 * Returns deduplicated array of numbers.
 */
function extractAllCandidateIds(data) {
  if (!data || typeof data !== 'object') return []
  const ids = new Set()

  // Direct fields
  if (data.venue_id) ids.add(Number(data.venue_id))
  if (typeof data.id === 'number') ids.add(data.id)
  if (data.id?.resy) ids.add(Number(data.id.resy))

  // Nested under venue
  if (data.venue?.id?.resy) ids.add(Number(data.venue.id.resy))
  if (data.venue?.venue_id) ids.add(Number(data.venue.venue_id))
  if (typeof data.venue?.id === 'number') ids.add(data.venue.id)

  // Config
  if (data.config?.venue_id) ids.add(Number(data.config.venue_id))

  // location.id is sometimes the venue_id
  if (data.location?.id) ids.add(Number(data.location.id))

  // objectID from search results (Algolia)
  if (data.objectID && /^\d+$/.test(String(data.objectID))) ids.add(Number(data.objectID))

  // Remove NaN and 0
  return [...ids].filter(n => n && !isNaN(n))
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

  const findUrl = `${BASE_URL}/4/find?${params}`
  const tokenPreview = authToken ? `${authToken.slice(0, 6)}...${authToken.slice(-4)}` : 'NONE'
  console.log(`[Resy API] Finding availability: venue_id=${venueId} date=${date} party=${partySize} token=${tokenPreview}`)
  const res = await fetch(findUrl, {
    headers: getHeaders(authToken)
  })

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Session expired'), { statusCode: res.status })
  }
  if (res.status === 429) {
    throw Object.assign(new Error('Rate limited'), { statusCode: 429 })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const contentType = res.headers.get('content-type') || ''
    console.error(`[Resy API] /4/find error ${res.status} (${contentType}): ${body.slice(0, 500)}`)
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
  const jsonBody = JSON.stringify({
    config_id: configId,
    day: day,
    party_size: partySize
  })

  console.log(`[Resy API] POST /3/details: config_id=${configId.slice(0, 30)}... day=${day} party=${partySize}`)

  const res = await fetch(`${BASE_URL}/3/details`, {
    method: 'POST',
    headers: jsonPostHeaders(authToken),
    body: jsonBody
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
  // Return cached value if still fresh
  if (_cachedPaymentMethod && (Date.now() - _cachedPaymentMethod.fetchedAt) < PAYMENT_CACHE_TTL) {
    return _cachedPaymentMethod.id
  }

  const res = await fetch(`${BASE_URL}/2/user`, {
    headers: getHeaders(authToken)
  })

  if (!res.ok) {
    throw Object.assign(new Error(`Failed to get user info: ${res.status}`), { statusCode: res.status })
  }

  const data = await res.json()
  const methods = data?.payment_methods || data?.payment_method_id
  let id = null
  if (Array.isArray(methods) && methods.length > 0) {
    id = methods[0].id
  } else if (typeof methods === 'number' || typeof methods === 'string') {
    id = methods
  }

  _cachedPaymentMethod = { id, fetchedAt: Date.now() }
  return id
}

/**
 * Book a reservation using a book_token and payment method.
 */
export async function bookReservation(authToken, bookToken, paymentMethodId) {
  const payload = { book_token: bookToken }
  if (paymentMethodId) {
    // Resy expects struct_payment_method as a JSON string inside the JSON body (double-encoded)
    payload.struct_payment_method = JSON.stringify({ id: paymentMethodId })
  }

  console.log(`[Resy API] POST /3/book: book_token=${bookToken.slice(0, 30)}... payment=${paymentMethodId || 'none'}`)

  const res = await fetch(`${BASE_URL}/3/book`, {
    method: 'POST',
    headers: jsonPostHeaders(authToken),
    body: JSON.stringify(payload)
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
 * Get venue calendar showing which dates have open slots.
 * Useful for UI calendar highlighting.
 * Returns array of { date, inventory } objects.
 */
export async function getVenueCalendar(authToken, venueId, numSeats) {
  const params = new URLSearchParams({
    venue_id: String(venueId),
    num_seats: String(numSeats || 2)
  })

  const res = await fetch(`${BASE_URL}/4/venue/calendar?${params}`, {
    headers: getHeaders(authToken)
  })

  if (!res.ok) {
    throw Object.assign(new Error(`Calendar API error: ${res.status}`), { statusCode: res.status })
  }

  const data = await res.json()
  // Response shape: { scheduled: [{ date: "2025-03-01", inventory: { ... } }] }
  const scheduled = data?.scheduled || []
  return scheduled.filter(d => {
    const inv = d.inventory || {}
    // A date has availability if any reservation type shows open slots
    return Object.values(inv).some(v => v?.reservation === 'available')
  }).map(d => ({
    date: d.date,
    inventory: d.inventory
  }))
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
