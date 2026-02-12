import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import CatalogPage from './pages/CatalogPage'
import MonitorPage from './pages/MonitorPage'
import SettingsPage from './pages/SettingsPage'

function KeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip shortcuts when typing in form elements (except Escape)
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key !== 'Escape') return
      }

      // Ctrl+N — navigate to Monitor & open wizard
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        navigate('/monitor')
        setTimeout(() => window.dispatchEvent(new CustomEvent('app:open-wizard')), 100)
      }

      // Ctrl+F — focus search input on current page
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app:focus-search'))
      }

      // Ctrl+1/2/3 — page navigation
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        navigate('/catalog')
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        navigate('/monitor')
      }
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        navigate('/settings')
      }

      // ? or Ctrl+/ — toggle shortcut help overlay
      if ((e.key === '?' && !e.ctrlKey && !e.metaKey) || (e.ctrlKey && e.key === '/')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('app:toggle-shortcuts'))
      }

      // Escape — close any open modal/wizard
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('app:close-modal'))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return null
}

function ShortcutHelpOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleToggle = () => setVisible(v => !v)
    const handleClose = () => setVisible(false)

    window.addEventListener('app:toggle-shortcuts', handleToggle)
    window.addEventListener('app:close-modal', handleClose)
    return () => {
      window.removeEventListener('app:toggle-shortcuts', handleToggle)
      window.removeEventListener('app:close-modal', handleClose)
    }
  }, [])

  if (!visible) return null

  const shortcuts = [
    { keys: 'Ctrl + N', action: 'New watch job' },
    { keys: 'Ctrl + F', action: 'Focus search' },
    { keys: 'Ctrl + 1', action: 'Go to Catalog' },
    { keys: 'Ctrl + 2', action: 'Go to Monitor' },
    { keys: 'Ctrl + 3', action: 'Go to Settings' },
    { keys: '?', action: 'Toggle this help' },
    { keys: 'Esc', action: 'Close modal / overlay' },
  ]

  return (
    <div className="shortcut-overlay" onClick={() => setVisible(false)}>
      <div className="shortcut-overlay__panel" onClick={e => e.stopPropagation()}>
        <h3 className="shortcut-overlay__title">Keyboard Shortcuts</h3>
        <div className="shortcut-overlay__list">
          {shortcuts.map(s => (
            <div className="shortcut-overlay__row" key={s.keys}>
              <kbd className="shortcut-overlay__kbd">{s.keys}</kbd>
              <span className="shortcut-overlay__action">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <KeyboardShortcuts />
        <ShortcutHelpOverlay />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/catalog" replace />} />
            <Route path="/catalog" element={<ErrorBoundary><CatalogPage /></ErrorBoundary>} />
            <Route path="/monitor" element={<ErrorBoundary><MonitorPage /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
