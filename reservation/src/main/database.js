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

  db.prepare(`
    INSERT INTO watch_jobs (id, restaurant_id, target_date, time_slots, party_size, status, priority, monitoring_strategy)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, 'continuous')
  `).run(id, restaurant_id, target_date, timeSlotsJson, party_size || 2, priority || 'normal')

  return db.prepare(`
    SELECT wj.*, r.name as restaurant_name, r.platform as restaurant_platform
    FROM watch_jobs wj
    LEFT JOIN restaurants r ON wj.restaurant_id = r.id
    WHERE wj.id = ?
  `).get(id)
}

export function updateWatchJob(id, fields) {
  const allowed = ['target_date', 'time_slots', 'party_size', 'status', 'priority']
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

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
