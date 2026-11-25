interface BridgeFilterSortProps {
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sortBy: string;
  onSortByChange: (sortBy: string) => void;
  /** Fuzzy search text. Filter the list with `filterByFuzzyQuery` from utils/fuzzySearch. */
  searchQuery?: string;
  /** When provided, the search input is rendered. */
  onSearchQueryChange?: (query: string) => void;
}

export default function BridgeFilterSort({
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  searchQuery = "",
  onSearchQueryChange,
}: BridgeFilterSortProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {onSearchQueryChange && (
        <div className="flex items-center gap-2">
          <label htmlFor="bridge-search" className="text-sm text-stellar-text-secondary">
            Search:
          </label>
          <input
            id="bridge-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Name, asset or chain"
            autoComplete="off"
            className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-sm text-stellar-text-secondary">
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <option value="all">All</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="sort-by" className="text-sm text-stellar-text-secondary">
          Sort by:
        </label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <option value="name">Name</option>
          <option value="tvl">TVL</option>
          <option value="volume">24h Volume</option>
          <option value="health">Health Score</option>
        </select>
      </div>
    </div>
  );
}
