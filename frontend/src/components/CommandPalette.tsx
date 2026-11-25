import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandAction, actionsRegistry } from "../utils/commandRegistry";

const STORAGE_KEY = "bridgewatch:recent_actions";

/**
 * Subsequence-aware fuzzy scorer: characters in `q` must appear in `text`
 * in order (not necessarily contiguous). Returns 0–1 where 1 is an exact
 * subsequence match. Bonus for prefix matches and consecutive characters.
 */
function fuzzyScore(q: string, text: string): number {
  if (!q) return 1;
  const lower = q.toLowerCase();
  const target = text.toLowerCase();
  if (target.includes(lower)) return 1;

  let pi = 0;
  let score = 0;
  let prevMatch = -1;
  for (let ti = 0; ti < target.length && pi < lower.length; ti++) {
    if (target[ti] === lower[pi]) {
      // Bonus for consecutive matches
      if (prevMatch === ti - 1) score += 0.15;
      // Bonus for word-boundary matches
      if (ti === 0 || target[ti - 1] === " " || target[ti - 1] === "-") score += 0.1;
      prevMatch = ti;
      pi++;
    }
  }
  if (pi < lower.length) return 0;
  return (pi / lower.length) + Math.min(score, 0.3);
}

/** Highlight matching characters in text. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = query.toLowerCase();
  const target = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  let pi = 0;
  for (let ti = 0; ti < target.length && pi < lower.length; ti++) {
    if (target[ti] === lower[pi]) {
      if (lastEnd < ti) parts.push(text.slice(lastEnd, ti));
      parts.push(
        <mark key={ti} className="bg-stellar-blue/30 text-white rounded px-0.5">
          {text[ti]}
        </mark>,
      );
      lastEnd = ti + 1;
      pi++;
    }
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return <>{parts}</>;
}

const QUICK_NAV_ITEMS: CommandAction[] = [
  { id: "nav-dashboard", title: "Go to Dashboard", href: "/", keywords: ["home", "overview"] },
  { id: "nav-bridges", title: "Go to Bridges", href: "/bridges", keywords: ["bridge", "list"] },
  { id: "nav-status", title: "Go to Status", href: "/status", keywords: ["health", "uptime"] },
  { id: "nav-analytics", title: "Go to Analytics", href: "/analytics", keywords: ["charts", "metrics"] },
  { id: "nav-liquidity", title: "Go to Liquidity", href: "/liquidity", keywords: ["fragmentation", "depth"] },
];

export interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export default function CommandPalette({
  open: controlledOpen,
  onOpenChange,
  onClose,
}: CommandPaletteProps = {}) {
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
    if (!next && onClose) {
      onClose();
    }
  };

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // If controlled by parent (like App), parent manages the hotkey toggle
    if (isControlled) return;

    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        setOpen(false);
        return;
      }

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        if (isInput) return;
        e.preventDefault();
        setOpen((s) => !s);
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !isInput) {
        e.preventDefault();
        setOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [isControlled, setOpen]);

  const allItems = useMemo(() => {
    const q = query.trim();
    const pool: CommandAction[] = [...QUICK_NAV_ITEMS, ...actionsRegistry];

    if (!q) {
      // Show recent items first, then quick nav
      const recentItems = recent
        .map((id) => pool.find((a) => a.id === id))
        .filter((a): a is CommandAction => Boolean(a));
      const navItems = QUICK_NAV_ITEMS.filter((a) => !recent.includes(a.id));
      return [...recentItems, ...navItems];
    }

    pool.sort((a, b) => {
      const sa = fuzzyScore(q, `${a.title} ${(a.keywords || []).join(" ")}`);
      const sb = fuzzyScore(q, `${b.title} ${(b.keywords || []).join(" ")}`);
      return sb - sa;
    });
    return pool.filter((a) => fuzzyScore(q, `${a.title} ${(a.keywords || []).join(" ")}`) > 0).slice(0, 15);
  }, [query, recent]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  function addRecent(id: string) {
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 10);
    setRecent(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }

  function execute(action: CommandAction) {
    addRecent(action.id);
    setOpen(false);
    setQuery("");
    if (action.onExecute) action.onExecute();
    else if (action.href) navigate(action.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) execute(allItems[selectedIndex]);
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-stellar-card border border-stellar-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-stellar-border">
          <label htmlFor="command-palette-input" className="sr-only">Type a command or search</label>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-stellar-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              id="command-palette-input"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-listbox"
              aria-activedescendant={allItems[selectedIndex] ? `cmd-${allItems[selectedIndex].id}` : undefined}
              aria-autocomplete="list"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command, search, or press / to open..."
              className="w-full bg-transparent text-white py-2 outline-none text-sm"
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-stellar-text-secondary bg-stellar-border rounded">ESC</kbd>
          </div>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {allItems.length === 0 && query.trim() !== "" && (
            <div className="px-4 py-8 text-center text-sm text-stellar-text-secondary">No results for &ldquo;{query}&rdquo;</div>
          )}
          {recent.length > 0 && query.trim() === "" && (
            <div className="px-3 pt-2 pb-1 text-xs text-stellar-text-secondary font-medium uppercase tracking-wider">Recent</div>
          )}
          {query.trim() === "" && recent.length > 0 && allItems.length > recent.length && (
            <div className="px-3 pt-2 pb-1 text-xs text-stellar-text-secondary font-medium uppercase tracking-wider">Quick Navigation</div>
          )}
          <ul ref={listRef} role="listbox" id="command-palette-listbox" aria-label="Available commands">
            {allItems.map((a, i) => (
              <li
                key={a.id}
                id={`cmd-${a.id}`}
                role="option"
                aria-selected={i === selectedIndex}
                tabIndex={-1}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); execute(a); } }}
                className={`px-3 py-2 cursor-pointer flex items-center gap-3 transition-colors ${
                  i === selectedIndex ? "bg-stellar-blue/20 text-white" : "hover:bg-stellar-border/60 text-stellar-text-primary"
                }`}
                onClick={() => execute(a)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    <HighlightedText text={a.title} query={query.trim()} />
                  </div>
                  {a.href && <div className="text-xs text-stellar-text-secondary truncate">{a.href}</div>}
                </div>
                {a.href && (
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-stellar-text-secondary bg-stellar-border rounded shrink-0">
                    ↵
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-2 border-t border-stellar-border flex items-center gap-4 text-[10px] text-stellar-text-secondary">
          <span><kbd className="font-mono bg-stellar-border px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-stellar-border px-1 rounded">↵</kbd> select</span>
          <span><kbd className="font-mono bg-stellar-border px-1 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
