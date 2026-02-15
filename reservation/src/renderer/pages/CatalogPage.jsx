import React, { useEffect, useState, useMemo } from 'react'
import { useIpc } from '../hooks/useIpc'
import StatsDashboard from '../components/StatsDashboard'
import SearchBar from '../components/SearchBar'
import RestaurantGrid from '../components/RestaurantGrid'
import WatchJobWizard from '../components/WatchJobWizard'
import AddRestaurantModal from '../components/AddRestaurantModal'

export default function CatalogPage() {
  const { invoke, on } = useIpc()
  const [allRestaurants, setAllRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [boroughFilter, setBoroughFilter] = useState('')
  const [starFilter, setStarFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardRestaurant, setWizardRestaurant] = useState(null)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const refreshRestaurants = () => {
    invoke('db:get-restaurants').then(rows => {
      setAllRestaurants(rows || [])
    })
  }

  useEffect(() => {
    invoke('db:get-restaurants').then(rows => {
      setAllRestaurants(rows || [])
      setLoading(false)
    })
    const unsub = on('images:complete', refreshRestaurants)
    return () => { if (unsub) unsub() }
  }, [])

  // Keyboard shortcut: Ctrl+F focuses search, Escape closes wizard
  useEffect(() => {
    const handleFocusSearch = () => {
      const input = document.querySelector('.search-bar__input')
      if (input) input.focus()
    }
    const handleCloseModal = () => setWizardOpen(false)

    window.addEventListener('app:focus-search', handleFocusSearch)
    window.addEventListener('app:close-modal', handleCloseModal)
    return () => {
      window.removeEventListener('app:focus-search', handleFocusSearch)
      window.removeEventListener('app:close-modal', handleCloseModal)
    }
  }, [])

  const filteredRestaurants = useMemo(() => {
    let result = allRestaurants

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.neighborhood && r.neighborhood.toLowerCase().includes(q)) ||
        (r.cuisine && r.cuisine.toLowerCase().includes(q))
      )
    }

    if (boroughFilter) {
      result = result.filter(r => r.borough === boroughFilter)
    }

    if (starFilter !== '') {
      const stars = parseInt(starFilter, 10)
      result = result.filter(r => r.stars === stars)
    }

    if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'stars') {
      result = [...result].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
    } else if (sortBy === 'location') {
      result = [...result].sort((a, b) =>
        a.borough.localeCompare(b.borough) ||
        a.neighborhood.localeCompare(b.neighborhood) ||
        a.name.localeCompare(b.name)
      )
    }

    return result
  }, [allRestaurants, searchQuery, boroughFilter, starFilter, sortBy])

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h2 className="page-title">Restaurant Catalog</h2>
          <p className="page-subtitle">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__row">
          <div>
            <h2 className="page-title">Restaurant Catalog</h2>
            <p className="page-subtitle">
              {allRestaurants.length} elite NYC restaurants
            </p>
          </div>
          <button className="wizard-btn wizard-btn--primary" onClick={() => setAddModalOpen(true)}>
            + Add Restaurant
          </button>
        </div>
      </div>

      <StatsDashboard restaurants={allRestaurants} />

      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        boroughFilter={boroughFilter}
        onBoroughChange={setBoroughFilter}
        starFilter={starFilter}
        onStarChange={setStarFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        resultCount={filteredRestaurants.length}
      />

      <RestaurantGrid
        restaurants={filteredRestaurants}
        onQuickWatch={(restaurant) => {
          setWizardRestaurant(restaurant)
          setWizardOpen(true)
        }}
      />

      <WatchJobWizard
        isOpen={wizardOpen}
        onClose={() => {
          setWizardOpen(false)
          setWizardRestaurant(null)
        }}
        onCreated={() => {
          setWizardOpen(false)
          setWizardRestaurant(null)
        }}
        restaurants={allRestaurants}
        preselectedRestaurant={wizardRestaurant}
      />

      <AddRestaurantModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={refreshRestaurants}
      />
    </div>
  )
}
