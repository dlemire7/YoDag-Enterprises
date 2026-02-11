import React, { useEffect } from 'react'
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

export default function App() {
  return (
    <HashRouter>
      <KeyboardShortcuts />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<ErrorBoundary><CatalogPage /></ErrorBoundary>} />
          <Route path="/monitor" element={<ErrorBoundary><MonitorPage /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
