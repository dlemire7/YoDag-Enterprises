import https from 'https'

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject)
        return
      }
      let html = ''
      res.on('data', chunk => html += chunk)
      res.on('end', () => resolve(html))
    }).on('error', reject)
  })
}

function extractRating(html) {
  // Pattern 1: JSON-LD structured data — "ratingValue":"4.7" or "ratingValue": 4.7
  const jsonLdMatch = html.match(/"ratingValue"\s*:\s*"?(\d\.\d)"?/)
  if (jsonLdMatch) {
    const val = parseFloat(jsonLdMatch[1])
    if (val >= 1.0 && val <= 5.0) return val
  }

  // Pattern 2: aria-label with stars — aria-label="4.7 stars" or "Rated 4.7 out of 5"
  const ariaMatch = html.match(/aria-label="(\d\.\d)\s*(?:stars?|out of)/i)
  if (ariaMatch) {
    const val = parseFloat(ariaMatch[1])
    if (val >= 1.0 && val <= 5.0) return val
  }

  // Pattern 3: rating value near review text — "4.7" followed by reviews/ratings
  const nearReviewMatch = html.match(/(\d\.\d)\s*<\/span>[\s\S]{0,200}?(?:review|rating)/i)
  if (nearReviewMatch) {
    const val = parseFloat(nearReviewMatch[1])
    if (val >= 1.0 && val <= 5.0) return val
  }

  return null
}

function extractMapsUrl(html) {
  // Pattern 1: Direct Maps place URL
  const mapsMatch = html.match(/href="(https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/place\/[^"]+)"/)
  if (mapsMatch) return mapsMatch[1].replace(/&amp;/g, '&')

  // Pattern 2: /maps? redirect URLs
  const mapsRedirect = html.match(/href="\/maps\?([^"]+)"/)
  if (mapsRedirect) return `https://www.google.com/maps?${mapsRedirect[1].replace(/&amp;/g, '&')}`

  return null
}

export async function fetchGoogleDataForRestaurant(restaurantName) {
  try {
    const query = encodeURIComponent(`${restaurantName} NYC restaurant`)
    const url = `https://www.google.com/search?q=${query}`
    const html = await fetchPage(url)

    const rating = extractRating(html)
    // Use scraped Maps URL if found, otherwise construct a search URL that will resolve correctly
    const mapsUrl = extractMapsUrl(html) ||
      `https://www.google.com/maps/search/${encodeURIComponent(restaurantName + ' NYC')}`

    return { rating, url: mapsUrl }
  } catch (err) {
    console.error(`Google data fetch failed for "${restaurantName}":`, err.message)
    return { rating: null, url: null }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchAllMissingGoogleData(restaurants, updateFn, onProgress) {
  let fetched = 0
  const total = restaurants.length

  for (const restaurant of restaurants) {
    const data = await fetchGoogleDataForRestaurant(restaurant.name)
    // Always save the Maps URL even if rating is null
    if (data.rating || data.url) {
      updateFn(restaurant.id, data.rating, data.url)
      fetched++
    }
    if (onProgress) onProgress(fetched, total, restaurant.name)
    // Rate limit: 2s between requests
    await delay(2000)
  }

  console.log(`Google data fetch complete: ${fetched}/${total} restaurants updated`)
  return fetched
}
