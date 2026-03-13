import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'

let db = null

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'reservations.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  migrateSchema()
  return dbPath
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      neighborhood TEXT,
      borough TEXT,
      cuisine TEXT,
      stars INTEGER DEFAULT 0,
      criteria TEXT,
      platform TEXT,
      reservation_release TEXT,
      url TEXT
    );

    CREATE TABLE IF NOT EXISTS watch_jobs (
      id TEXT PRIMARY KEY,
      restaurant_id INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      time_slots TEXT,
      party_size INTEGER DEFAULT 2,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      monitoring_strategy TEXT DEFAULT 'continuous',
      poll_interval_sec INTEGER DEFAULT 30,
      booked_at TEXT,
      confirmation_code TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    );

    CREATE TABLE IF NOT EXISTS booking_history (
      id TEXT PRIMARY KEY,
      watch_job_id TEXT,
      restaurant TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      party_size INTEGER,
      platform TEXT,
      status TEXT DEFAULT 'attempted',
      confirmation_code TEXT,
      attempt_log TEXT,
      error_details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (watch_job_id) REFERENCES watch_jobs(id)
    );

    CREATE TABLE IF NOT EXISTS credentials (
      platform TEXT PRIMARY KEY,
      encrypted_data BLOB,
      validated_at TEXT
    );
  `)
}

function migrateSchema() {
  const columns = db.pragma('table_info(restaurants)')
  const hasImageUrl = columns.some(col => col.name === 'image_url')
  if (!hasImageUrl) {
    db.exec('ALTER TABLE restaurants ADD COLUMN image_url TEXT')
  }
  const hasVenueId = columns.some(col => col.name === 'venue_id')
  if (!hasVenueId) {
    db.exec('ALTER TABLE restaurants ADD COLUMN venue_id TEXT')
  }

  // Fix Laser Wolf URL (slug is laser-wolf-brooklyn, not laser-wolf)
  db.prepare(`UPDATE restaurants SET url = 'https://resy.com/cities/ny/laser-wolf-brooklyn' WHERE name = 'Laser Wolf' AND url != 'https://resy.com/cities/ny/laser-wolf-brooklyn'`).run()
  // Clear known-bad venue_id (58848 was a content ID, not API venue_id)
  db.prepare(`UPDATE restaurants SET venue_id = NULL WHERE name = 'Laser Wolf' AND venue_id = '58848'`).run()

  // Clean up stale booking history from the Content-Type 415 bug (all were form-encoded POST failures)
  db.prepare(`DELETE FROM booking_history WHERE status = 'failed' AND error_details LIKE '%415%'`).run()

  const hasBeliLists = columns.some(col => col.name === 'beli_lists')
  if (!hasBeliLists) {
    db.exec('ALTER TABLE restaurants ADD COLUMN beli_lists TEXT')
  }

  const hasGoogleRating = columns.some(col => col.name === 'google_rating')
  if (!hasGoogleRating) {
    db.exec('ALTER TABLE restaurants ADD COLUMN google_rating REAL')
  }
  const hasGoogleUrl = columns.some(col => col.name === 'google_url')
  if (!hasGoogleUrl) {
    db.exec('ALTER TABLE restaurants ADD COLUMN google_url TEXT')
  }

  // Remove duplicate restaurants (same name, different platform) that were added
  // after seed data. Keep the earliest entry (lowest id, from seed) and delete later dupes.
  // Only delete if the dupe has no active watch jobs.
  db.prepare(`
    DELETE FROM restaurants WHERE id IN (
      SELECT r2.id FROM restaurants r1
      JOIN restaurants r2 ON LOWER(r1.name) = LOWER(r2.name) AND r1.id < r2.id
      WHERE r2.id NOT IN (SELECT restaurant_id FROM watch_jobs WHERE status IN ('pending', 'monitoring'))
    )
  `).run()

  // Fix restaurants that were incorrectly seeded with wrong platforms/URLs
  const platformFixes = [
    { name: 'Per Se', platform: 'Tock', url: 'https://www.exploretock.com/perse', release: 'Monthly drop' },
    { name: 'Aquavit', platform: 'Tock', url: 'https://www.exploretock.com/aquavit', release: 'Monthly drop' },
    { name: 'Jungsik', platform: 'Tock', url: 'https://www.exploretock.com/jungsik', release: 'Monthly drop' },
    { name: 'Blue Hill', platform: 'Tock', url: 'https://www.exploretock.com/bluehillnyc', release: 'Monthly drop' },
    { name: 'Estela', platform: 'Tock', url: 'https://www.exploretock.com/estela', release: 'Monthly drop' },
    { name: 'The Musket Room', platform: 'Tock', url: 'https://www.exploretock.com/themusketroom', release: 'Monthly drop' },
    { name: '63 Clinton', platform: 'Resy', url: 'https://resy.com/cities/new-york-ny/venues/sixty-three-clinton', release: '14 days ahead' },
  ]
  const fixStmt = db.prepare('UPDATE restaurants SET platform = ?, url = ?, reservation_release = ?, venue_id = NULL WHERE LOWER(name) = LOWER(?)')
  for (const fix of platformFixes) {
    fixStmt.run(fix.platform, fix.url, fix.release, fix.name)
  }
}

export function getRestaurants() {
  return db.prepare('SELECT * FROM restaurants ORDER BY name').all()
}

export function getWatchJobs() {
  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    ORDER BY wj.created_at DESC
  `).all()
}

export function getBookingHistory() {
  return db.prepare('SELECT * FROM booking_history ORDER BY created_at DESC').all()
}

export function getDatabase() {
  return db
}

export function createWatchJob({ restaurant_id, target_date, time_slots, party_size, priority }) {
  const id = uuidv4()
  const timeSlotsJson = JSON.stringify(time_slots || [])

  // Auto-detect monitoring strategy from restaurant's reservation_release field
  const restaurant = db.prepare('SELECT reservation_release FROM restaurants WHERE id = ?').get(restaurant_id)
  const releaseStr = restaurant?.reservation_release || ''
  const isParseable = /^\d+\s*(days?|weeks?)\s*ahead/i.test(releaseStr)
  const strategy = isParseable ? 'release_time' : 'continuous'
  const pollInterval = isParseable ? 5 : 30

  db.prepare(`
    INSERT INTO watch_jobs (id, restaurant_id, target_date, time_slots, party_size, status, priority, monitoring_strategy, poll_interval_sec)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, restaurant_id, target_date, timeSlotsJson, party_size || 2, priority || 'normal', strategy, pollInterval)

  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    WHERE wj.id = ?
  `).get(id)
}

export function updateWatchJob(id, fields) {
  const allowed = ['target_date', 'time_slots', 'party_size', 'status', 'priority', 'booked_at', 'confirmation_code', 'monitoring_strategy', 'poll_interval_sec']
  const updates = []
  const values = []

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'time_slots') {
        updates.push(`${key} = ?`)
        values.push(JSON.stringify(fields[key]))
      } else {
        updates.push(`${key} = ?`)
        values.push(fields[key])
      }
    }
  }

  if (updates.length === 0) return null

  updates.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE watch_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    WHERE wj.id = ?
  `).get(id)
}

export function cancelWatchJob(id) {
  db.prepare(`UPDATE watch_jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(id)

  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    WHERE wj.id = ?
  `).get(id)
}

export function getRestaurantsWithoutImages() {
  return db.prepare('SELECT id, name FROM restaurants WHERE image_url IS NULL ORDER BY id').all()
}

export function updateRestaurantImage(id, imageUrl) {
  db.prepare('UPDATE restaurants SET image_url = ? WHERE id = ?').run(imageUrl, id)
}

export function getRestaurantsWithoutGoogleData() {
  return db.prepare('SELECT id, name FROM restaurants WHERE google_rating IS NULL ORDER BY id').all()
}

export function updateRestaurantGoogleData(id, googleRating, googleUrl) {
  db.prepare('UPDATE restaurants SET google_rating = ?, google_url = ? WHERE id = ?').run(googleRating, googleUrl, id)
}

export function getActiveWatchJobs() {
  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform, r.url, r.venue_id, r.reservation_release
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    WHERE wj.status IN ('pending', 'monitoring')
    ORDER BY wj.created_at ASC
  `).all()
}

export function getRestaurantById(id) {
  return db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id)
}

export function updateRestaurantVenueId(id, venueId) {
  db.prepare('UPDATE restaurants SET venue_id = ? WHERE id = ?').run(venueId, id)
}

export function createBookingRecord({ watch_job_id, restaurant, date, time, party_size, platform, status, confirmation_code, attempt_log, error_details }) {
  const id = uuidv4()
  db.prepare(`
    INSERT INTO booking_history (id, watch_job_id, restaurant, date, time, party_size, platform, status, confirmation_code, attempt_log, error_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, watch_job_id, restaurant, date, time, party_size, platform, status, confirmation_code || null, attempt_log || null, error_details || null)
  return id
}

export function createRestaurant({ name, neighborhood, borough, cuisine, stars, criteria, platform, reservation_release, url, image_url, venue_id, beli_lists }) {
  // Check for duplicate by name (any platform) — a restaurant should only appear once
  const existing = db.prepare(
    'SELECT id, platform FROM restaurants WHERE LOWER(name) = LOWER(?)'
  ).get(name)

  if (existing) {
    return { id: existing.id, duplicate: true, existingPlatform: existing.platform }
  }

  const result = db.prepare(`
    INSERT INTO restaurants (name, neighborhood, borough, cuisine, stars, criteria, platform, reservation_release, url, image_url, venue_id, beli_lists)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    neighborhood || null,
    borough || null,
    cuisine || null,
    stars || 0,
    criteria || null,
    platform || null,
    reservation_release || null,
    url || null,
    image_url || null,
    venue_id || null,
    beli_lists || null
  )

  return { id: result.lastInsertRowid, duplicate: false }
}

export function updateRestaurantBeliLists(id, beliLists) {
  db.prepare('UPDATE restaurants SET beli_lists = ? WHERE id = ?').run(beliLists, id)
}

export function findRestaurantByName(name) {
  return db.prepare('SELECT * FROM restaurants WHERE LOWER(name) = LOWER(?)').get(name)
}

export function getUnknownPlatformRestaurants() {
  return db.prepare("SELECT * FROM restaurants WHERE platform = 'Unknown' ORDER BY name").all()
}

export function updateRestaurantPlatform(id, { platform, url, venue_id, image_url, reservation_release }) {
  const updates = []
  const values = []
  if (platform !== undefined) { updates.push('platform = ?'); values.push(platform) }
  if (url !== undefined) { updates.push('url = ?'); values.push(url) }
  if (venue_id !== undefined) { updates.push('venue_id = ?'); values.push(venue_id) }
  if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url) }
  if (reservation_release !== undefined) { updates.push('reservation_release = ?'); values.push(reservation_release) }
  if (updates.length === 0) return
  values.push(id)
  db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values)
}

export function getBookableRestaurants() {
  return db.prepare("SELECT * FROM restaurants WHERE platform IN ('Resy', 'Tock') AND url IS NOT NULL ORDER BY platform, name").all()
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
