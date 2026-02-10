import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { path: '/catalog', label: 'Restaurant Catalog', icon: '\u2726' },
  { path: '/monitor', label: 'Monitor & Book', icon: '\u25C9' },
  { path: '/settings', label: 'Settings', icon: '\u2699' }
]

export default function Layout() {
  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">NYC Elite</h1>
          <p className="app-subtitle">Reservations</p>
        </div>
        <ul className="nav-list">
          {navItems.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link--active' : ''}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <span className="version-label">v1.0.0</span>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
