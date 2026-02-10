import React from 'react'

export default function SearchBar({
  searchQuery,
  onSearchChange,
  boroughFilter,
  onBoroughChange,
  starFilter,
  onStarChange,
  sortBy,
  onSortChange,
  resultCount
}) {
  return (
    <div className="search-bar">
      <div className="search-bar__input-wrapper">
        <input
          type="text"
          className="search-bar__input"
          placeholder="Search by name, neighborhood, or cuisine..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="search-bar__clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      <div className="search-bar__filters">
        <select
          className="search-bar__select"
          value={boroughFilter}
          onChange={e => onBoroughChange(e.target.value)}
        >
          <option value="">All Boroughs</option>
          <option value="Manhattan">Manhattan</option>
          <option value="Brooklyn">Brooklyn</option>
        </select>

        <select
          className="search-bar__select"
          value={starFilter}
          onChange={e => onStarChange(e.target.value)}
        >
          <option value="">All Stars</option>
          <option value="3">★★★ Three Stars</option>
          <option value="2">★★ Two Stars</option>
          <option value="1">★ One Star</option>
          <option value="0">Non-Starred</option>
        </select>

        <select
          className="search-bar__select"
          value={sortBy}
          onChange={e => onSortChange(e.target.value)}
        >
          <option value="name">Sort: A-Z</option>
          <option value="stars">Sort: Stars (High to Low)</option>
          <option value="location">Sort: Location</option>
        </select>
      </div>

      <span className="search-bar__count">
        {resultCount} result{resultCount !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
