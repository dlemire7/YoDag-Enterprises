# NYC Elite Restaurant Reservation System — Implementation Plan

## Status: PENDING USER APPROVAL

> Review this plan and resume with Claude to begin implementation.

---

## Context

Build a full v2.0 Windows desktop application for discovering, monitoring, and auto-booking reservations at 60+ elite NYC restaurants (Brooklyn & Manhattan). The PRD is at `NYC-Restaurant-Reservation-System-PRD-v2.docx` in this folder. No code exists yet — greenfield build.

**Stack decided**: Electron 28+ / React 18 / Vite / SQLite (better-sqlite3) / Playwright / Node.js

---

## Project Structure

```
reservation/
├── package.json
├── vite.config.js
├── forge.config.js
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.js            # Window creation, IPC handlers
│   │   ├── database.js         # SQLite setup, schema, queries
│   │   ├── seed-data.js        # 60 restaurant records
│   │   ├── scheduler.js        # Polling engine / watch job executor
│   │   ├── credentials.js      # Windows DPAPI credential encryption
│   │   ├── notifications.js    # Desktop toast + sound alerts
│   │   └── platforms/
│   │       ├── resy.js         # Resy API + Playwright fallback
│   │       ├── tock.js         # Tock browser automation
│   │       └── opentable.js    # OpenTable browser automation
│   ├── preload/
│   │   └── index.js            # contextBridge exposing IPC to renderer
│   └── renderer/               # React app (Vite-bundled)
│       ├── index.html
│       ├── main.jsx
│       ├── App.jsx             # Root component with routing
│       ├── styles/
│       │   ├── global.css      # CSS variables, fonts, reset
│       │   └── components.css
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── RestaurantCard.jsx
│       │   ├── RestaurantGrid.jsx
│       │   ├── SearchBar.jsx
│       │   ├── StatsDashboard.jsx
│       │   ├── WatchJobWizard.jsx
│       │   ├── ActiveJobs.jsx
│       │   ├── BookingHistory.jsx
│       │   ├── CredentialManager.jsx
│       │   └── Badge.jsx
│       ├── hooks/
│       │   └── useIpc.js
│       └── pages/
│           ├── CatalogPage.jsx
│           ├── MonitorPage.jsx
│           └── SettingsPage.jsx
└── resources/
    └── icon.ico
```

---

## Implementation Phases

### Phase 1: Project Scaffolding & Core Infrastructure
- Electron + React boilerplate with electron-vite and hot reload
- SQLite database with better-sqlite3 (schema for restaurants, watch_jobs, booking_history, credentials)
- IPC layer (contextBridge) connecting main ↔ renderer
- **Verify**: App launches, navigation works, database file created

### Phase 2: Restaurant Data & Catalog UI
- Seed all 60 restaurants (5x 3-star, 14x 2-star, 33x 1-star, 8x non-starred)
- Restaurant cards with dark theme (#1a1a1a) + gold accents (#d4af37)
- Badges: Michelin (red), Google (blue), Eater (green)
- Real-time search (name/neighborhood/cuisine), borough filter, star filter, sort (A-Z/stars/location)
- Statistics dashboard: total, Michelin-starred, 3-star, Brooklyn counts
- **Verify**: 60 restaurants display, search/filter/sort < 50ms

### Phase 3: Watch Job System & UI
- Watch job CRUD via IPC
- Multi-step creation wizard: restaurant → date → time slots (30-min) → party size → confirm
- Active jobs dashboard with status indicators and countdown timers
- Booking history table with expandable attempt logs
- Quick-book button on restaurant cards
- **Verify**: Create/edit/cancel jobs, wizard flow, history page

### Phase 4: Credential Management & Platform Integration
- Windows DPAPI encryption for credentials (dpapi npm package)
- Credential setup UI per platform with "Test Login" validation
- Playwright automation modules for Resy (API + browser), Tock (browser), OpenTable (browser)
- Headless Chromium launched from main process (separate from Electron's)
- **Verify**: Credentials save/validate, Playwright launches, platforms reachable

### Phase 5: Monitoring Engine & Auto-Booking
- Polling scheduler: release-time (3-5 sec aggressive) vs continuous (30 sec)
- Max 10 concurrent jobs with job queue
- Booking execution: detect → lock slot within 2 sec → fill form → confirm → notify
- Error handling: CAPTCHA detection, rate limiting (429), session expiry, exponential backoff
- Real-time IPC events to update renderer UI
- Desktop toast notifications + sound on booking success
- System tray with background monitoring
- **Verify**: Polling visible in UI, notifications fire, end-to-end booking flow

### Phase 6: Polish & Packaging
- Card hover animations, page transitions, status pulse effects
- Keyboard shortcuts (Ctrl+N, Ctrl+F, Escape)
- React error boundaries
- Electron Forge packaging → Windows .exe installer
- **Verify**: Packaged app works end-to-end

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build tool | electron-vite | Purpose-built for Electron + Vite |
| IPC pattern | invoke/handle + send/on | Request-response for DB, events for real-time |
| Playwright | Separate Chromium instance | Must not share Electron's Chromium |
| Credentials | Windows DPAPI | OS-level encryption, no master password |
| CSS | Plain CSS + custom properties | Matches PRD design system, no overhead |

---

## Database Schema

**restaurants**: id, name, neighborhood, borough, cuisine, stars, criteria (JSON), platform, reservation_release, url
**watch_jobs**: id (UUID), restaurant_id, target_date, time_slots (JSON), party_size, status, priority, monitoring_strategy, poll_interval_sec, booked_at, confirmation_code
**booking_history**: id (UUID), watch_job_id, restaurant, date, time, party_size, platform, status, confirmation_code, attempt_log (JSON), error_details
**credentials**: platform (PK), encrypted_data (BLOB), validated_at

---

## Design System

- **Background**: #0a0a0a (primary), #1a1a1a (cards)
- **Accent**: #d4af37 (gold)
- **Badges**: Michelin #ff4757, Google #4285f4, Eater #16a34a
- **Status**: Monitoring #3b82f6, Booked #22c55e, Failed #ef4444
- **Fonts**: Cormorant Garamond (serif headings), DM Sans (sans body)

---

## Next Steps

When resuming:
1. Approve or modify this plan
2. Begin Phase 1 (scaffolding) — takes ~15 minutes
3. Proceed through phases sequentially — each produces a working increment
