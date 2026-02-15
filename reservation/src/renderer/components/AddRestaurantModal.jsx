import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useIpc } from '../hooks/useIpc'

const PLATFORMS = ['Resy', 'Tock', 'OpenTable']

function parsePlatformFromUrl(url) {
  if (/resy\.com/i.test(url)) return 'Resy'
  if (/exploretock\.com/i.test(url)) return 'Tock'
  if (/opentable\.com/i.test(url)) return 'OpenTable'
  return null
}

function nameFromUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const slug = parts[parts.length - 1] || parts[0] || ''
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  } catch {
    return ''
  }
}

export default function AddRestaurantModal({ isOpen, onClose, onAdded }) {
  const { invoke } = useIpc()

  const [platform, setPlatform] = useState('Resy')
  const [query, setQuery] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [noCredentials, setNoCredentials] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [duplicateMsg, setDuplicateMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setPlatform('Resy')
      setQuery('')
      setPasteUrl('')
      setResults([])
      setSearching(false)
      setSearchError('')
      setNoCredentials(false)
      setAddingId(null)
      setSuccessMsg('')
      setDuplicateMsg('')
    }
  }, [isOpen])

  // Clear results/errors when platform changes
  useEffect(() => {
    setResults([])
    setSearchError('')
    setNoCredentials(false)
    setSuccessMsg('')
    setDuplicateMsg('')
  }, [platform])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setNoCredentials(false)
    setResults([])
    setSuccessMsg('')
    setDuplicateMsg('')

    try {
      const res = await invoke('restaurant:search', { query: query.trim(), platform })
      if (res.noCredentials) {
        setNoCredentials(true)
      } else if (res.success) {
        setResults(res.results || [])
        if ((res.results || []).length === 0) {
          setSearchError('No results found. Try a different search term.')
        }
      } else {
        setSearchError(res.error || 'Search failed')
      }
    } catch (err) {
      setSearchError(err.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleAdd = async (restaurant) => {
    const id = restaurant.venue_id || restaurant.url || restaurant.name
    setAddingId(id)
    setSuccessMsg('')
    setDuplicateMsg('')

    try {
      const res = await invoke('db:add-restaurant', restaurant)
      if (res.duplicate) {
        setDuplicateMsg(`"${restaurant.name}" is already in your catalog.`)
      } else if (res.success) {
        setSuccessMsg(`"${restaurant.name}" added to catalog!`)
        if (onAdded) onAdded()
      } else {
        setSearchError(res.error || 'Failed to add restaurant')
      }
    } catch (err) {
      setSearchError(err.message || 'Failed to add restaurant')
    } finally {
      setAddingId(null)
    }
  }

  const handlePasteAdd = async () => {
    if (!pasteUrl.trim()) return
    const detectedPlatform = parsePlatformFromUrl(pasteUrl.trim())
    if (!detectedPlatform) {
      setSearchError('Unrecognized URL. Please paste a Resy, Tock, or OpenTable link.')
      return
    }

    const name = nameFromUrl(pasteUrl.trim())
    if (!name) {
      setSearchError('Could not parse restaurant name from URL.')
      return
    }

    await handleAdd({
      name,
      platform: detectedPlatform,
      url: pasteUrl.trim(),
      neighborhood: '',
      borough: '',
      cuisine: '',
      stars: 0
    })
    setPasteUrl('')
  }

  if (!isOpen) return null

  return createPortal(
    <div className="wizard-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="wizard-modal" style={{ width: 620 }}>
        <div className="wizard-header">
          <h3 className="wizard-header__title">Add Restaurant</h3>
          <button className="wizard-header__close" onClick={onClose}>&times;</button>
        </div>

        <div className="wizard-body">
          {/* Platform tabs */}
          <div className="add-restaurant__platform-tabs">
            {PLATFORMS.map(p => (
              <button
                key={p}
                className={`add-restaurant__platform-tab${platform === p ? ` add-restaurant__platform-tab--active add-restaurant__platform-tab--${p.toLowerCase()}` : ''}`}
                onClick={() => setPlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Search row */}
          <div className="add-restaurant__search-row">
            <input
              className="wizard-input"
              type="text"
              placeholder={`Search ${platform} restaurants...`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Paste URL fallback */}
          <div className="add-restaurant__divider">or paste a URL</div>
          <div className="add-restaurant__search-row">
            <input
              className="wizard-input"
              type="text"
              placeholder="https://resy.com/cities/ny/..."
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePasteAdd() }}
            />
            <button
              className="wizard-btn wizard-btn--secondary"
              onClick={handlePasteAdd}
              disabled={!pasteUrl.trim()}
            >
              Add
            </button>
          </div>

          {/* Success banner */}
          {successMsg && (
            <div className="add-restaurant__success">{successMsg}</div>
          )}

          {/* Duplicate warning */}
          {duplicateMsg && (
            <div className="add-restaurant__warning">{duplicateMsg}</div>
          )}

          {/* No credentials warning */}
          {noCredentials && (
            <div className="add-restaurant__warning">
              Not signed into {platform}. Go to Settings to sign in first.
            </div>
          )}

          {/* Search error */}
          {searchError && !noCredentials && (
            <div className="add-restaurant__warning">{searchError}</div>
          )}

          {/* Loading state */}
          {searching && (
            <div className="availability-section__loading">
              <div className="credential-signing-spinner" />
              <span>Searching {platform}...</span>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="add-restaurant__results">
              {results.map((r, idx) => {
                const itemId = r.venue_id || r.url || r.name
                return (
                  <div key={idx} className="add-restaurant__result">
                    <div className="add-restaurant__result-info">
                      <div className="add-restaurant__result-name">{r.name}</div>
                      <div className="add-restaurant__result-meta">
                        {[r.neighborhood, r.cuisine].filter(Boolean).join(' \u00B7 ')}
                      </div>
                      {r.url && (
                        <div className="add-restaurant__result-url">{r.url}</div>
                      )}
                    </div>
                    <button
                      className="wizard-btn wizard-btn--primary add-restaurant__result-add"
                      disabled={addingId === itemId}
                      onClick={() => handleAdd(r)}
                    >
                      {addingId === itemId ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
