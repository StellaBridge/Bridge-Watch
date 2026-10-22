import { useRef } from "react";
import { SHORTCUTS, type ShortcutDefinition } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

function formatKey(def: ShortcutDefinition): string {
  const parts: string[] = [];
  if (def.mod) parts.push(isMac() ? "⌘" : "Ctrl");
  if (def.shift) parts.push("Shift");
  if (def.alt) parts.push(isMac() ? "⌥" : "Alt");
  // Display two-key sequences cleanly
  parts.push(...def.key.split(" ").map((k) => (k === "Escape" ? "Esc" : k)));
  return parts.join(" + ");
}

const CATEGORIES = ["Navigation", "Actions", "UI"] as const;

export default function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  const overlayRef = useFocusTrap({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={overlayRef as React.RefObject<HTMLDivElement>}
        className="relative w-full max-w-lg mx-4 rounded-xl border border-stellar-border bg-stellar-card shadow-2xl focus:outline-none overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stellar-border">
          <h2 className="text-base font-semibold text-stellar-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts panel"
            className="rounded-md p-1 text-stellar-text-secondary hover:text-stellar-text-primary hover:bg-stellar-border/40 focus:outline-none focus:ring-2 focus:ring-stellar-blue transition-colors"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Shortcut list */}
        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {CATEGORIES.map((cat) => {
            const defs = SHORTCUTS.filter((s) => s.category === cat);
            return (
              <section key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">
                  {cat}
                </h3>
                <ul className="space-y-1">
                  {defs.map((def) => (
                    <li
                      key={def.key + def.description}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm text-stellar-text-primary">
                        {def.description}
                      </span>
                      <kbd className="shrink-0 inline-flex items-center gap-1 rounded border border-stellar-border bg-stellar-dark px-2 py-0.5 font-mono text-xs text-stellar-text-secondary">
                        {formatKey(def)}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-stellar-border text-xs text-stellar-text-secondary">
          Press <kbd className="font-mono">?</kbd> to toggle this panel ·{" "}
          <kbd className="font-mono">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
