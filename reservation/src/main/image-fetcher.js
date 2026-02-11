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

function extractImageUrls(html) {
  const urls = []

  // Pattern 1: Google Images embeds full-size URLs in array format ["url",width,height]
  const arrayPattern = /\["(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*\d+,\s*\d+\]/g
  for (const match of html.matchAll(arrayPattern)) {
    const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
    if (!url.includes('encrypted-tbn') && !url.includes('gstatic.com') && !url.includes('google.com')) {
      urls.push(url)
    }
  }

  // Pattern 2: "ou":"url" format (older Google format)
  const ouPattern = /"ou":"(https?:\/\/[^"]+)"/g
  for (const match of html.matchAll(ouPattern)) {
    const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
    if (!url.includes('encrypted-tbn') && !url.includes('gstatic.com') && !url.includes('google.com')) {
      urls.push(url)
    }
  }

  // Pattern 3: Image URLs in data attributes or img src with external hosts
  const srcPattern = /(?:src|data-src)="(https?:\/\/(?!encrypted-tbn)[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g
  for (const match of html.matchAll(srcPattern)) {
    const url = match[1]
    if (!url.includes('gstatic.com') && !url.includes('google.com')) {
      urls.push(url)
    }
  }

  return urls
}

export async function fetchImageForRestaurant(restaurantName) {
  try {
    const query = encodeURIComponent(`${restaurantName} restaurant NYC`)
    const url = `https://www.google.com/search?q=${query}&tbm=isch&ijn=0`
    const html = await fetchPage(url)
    const imageUrls = extractImageUrls(html)
    return imageUrls.length > 0 ? imageUrls[0] : null
  } catch (err) {
    console.error(`Image fetch failed for "${restaurantName}":`, err.message)
    return null
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchAllMissingImages(restaurants, updateFn, onProgress) {
  let fetched = 0
  const total = restaurants.length

  for (const restaurant of restaurants) {
    const imageUrl = await fetchImageForRestaurant(restaurant.name)
    if (imageUrl) {
      updateFn(restaurant.id, imageUrl)
      fetched++
    }
    if (onProgress) onProgress(fetched, total, restaurant.name)
    // Rate limit: 1.5s between requests to avoid being blocked
    await delay(1500)
  }

  console.log(`Image fetch complete: ${fetched}/${total} images found`)
  return fetched
}
