import { useState, useEffect, useCallback } from "react";
import SearchModal from "./SearchModal";

/**
 * GlobalSearch
 *
 * Renders the search trigger button that lives in the Navbar.
 * Handles:
 *  - Click to open the modal
 *  - Cmd+K / Ctrl+K keyboard shortcut
 *  - Renders the SearchModal (portal-style, via fixed positioning inside the modal itself)
 */
export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // ── Global keyboard shortcut ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (macOS) or Ctrl+K (Windows/Linux)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={open}
        aria-label="Open search (Ctrl+K)"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stellar-border/60 border border-stellar-border hover:border-stellar-blue/60 hover:bg-stellar-border transition-colors text-stellar-text-secondary hover:text-white group"
      >
        {/* Search icon */}
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.15 10.15z"
          />
        </svg>

        <span className="hidden sm:inline text-sm">Search…</span>

        {/* Keyboard shortcut hint */}
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono rounded bg-stellar-dark border border-stellar-border group-hover:border-stellar-blue/40 transition-colors">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </button>

      {/* Modal */}
      <SearchModal isOpen={isOpen} onClose={close} />
    </>
  );
}
