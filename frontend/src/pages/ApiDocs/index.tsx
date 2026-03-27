import { useState, useMemo } from "react";
import { ENDPOINTS, CATEGORIES } from "./data";
import EndpointCard from "./EndpointCard";
import ApiSearch from "./ApiSearch";

export default function ApiDocs() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ENDPOINTS.filter((e) => {
      const matchesCategory = activeCategory === "All" || e.category === activeCategory;
      const matchesSearch =
        !q ||
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">API Reference</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Interactive documentation for the Stellar Bridge Watch REST and WebSocket API.
        </p>
      </div>

      {/* Auth & Rate Limit info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-1">
          <p className="text-sm font-semibold text-white">Authentication</p>
          <p className="text-sm text-stellar-text-secondary">
            The public API is currently open — no authentication required. An API key system will be introduced in Phase 2.
          </p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-1">
          <p className="text-sm font-semibold text-white">Rate Limiting</p>
          <p className="text-sm text-stellar-text-secondary">
            100 requests per minute per IP. Exceeding this returns <span className="font-mono text-orange-400">429 Too Many Requests</span>.
            The <span className="font-mono text-white">Retry-After</span> header indicates when to retry.
          </p>
        </div>
      </div>

      {/* Base URL */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-stellar-text-secondary shrink-0">Base URL</span>
        <code className="text-sm text-white font-mono">https://api.bridgewatch.stellar.org</code>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ApiSearch value={search} onChange={setSearch} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                activeCategory === cat
                  ? "bg-stellar-blue border-stellar-blue text-white"
                  : "border-stellar-border text-stellar-text-secondary hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint list grouped by category */}
      {filtered.length === 0 ? (
        <p className="text-stellar-text-secondary text-sm">No endpoints match your search.</p>
      ) : (
        CATEGORIES.filter((cat) => filtered.some((e) => e.category === cat)).map((cat) => {
          const group = filtered.filter((e) => e.category === cat);
          if (!group.length) return null;
          return (
            <section key={cat} className="space-y-3">
              <h2 className="text-lg font-semibold text-white border-b border-stellar-border pb-2">{cat}</h2>
              {group.map((endpoint) => (
                <EndpointCard key={endpoint.id} endpoint={endpoint} />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
