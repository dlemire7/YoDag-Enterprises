import React, { useEffect, useState, useMemo } from 'react'
import { useIpc } from '../hooks/useIpc'
import StatsDashboard from '../components/StatsDashboard'
import SearchBar from '../components/SearchBar'
import RestaurantGrid from '../components/RestaurantGrid'
import WatchJobWizard from '../components/WatchJobWizard'

export default function CatalogPage() {
  const { invoke } = useIpc()
  const [allRestaurants, setAllRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [boroughFilter, setBoroughFilter] = useState('')
  const [starFilter, setStarFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardRestaurant, setWizardRestaurant] = useState(null)

  useEffect(() => {
    invoke('db:get-restaurants').then(rows => {
      setAllRestaurants(rows || [])
      setLoading(false)
    })
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
        <h2 className="page-title">Restaurant Catalog</h2>
        <p className="page-subtitle">
          {allRestaurants.length} elite NYC restaurants
        </p>
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
    </div>
  )
}
