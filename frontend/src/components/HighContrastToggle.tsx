import { useTheme } from "../theme/useTheme";

export default function HighContrastToggle() {
  const { highContrast, toggleHighContrast } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleHighContrast}
      role="switch"
      aria-checked={highContrast}
      className="inline-flex items-center gap-2 rounded-full border border-stellar-border bg-stellar-card px-2 py-1 text-xs font-medium text-stellar-text-primary hover:border-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
      aria-label="High contrast mode"
      title="High contrast mode (WCAG AAA)"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-stellar-border transition-colors ${
          highContrast ? "bg-stellar-blue" : "bg-stellar-border/60"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            highContrast ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="tabular-nums">HC</span>
    </button>
  );
}
