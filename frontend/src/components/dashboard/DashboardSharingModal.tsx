import { useMemo, useState } from "react";
import CopyButton from "../CopyButton";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface DashboardSharingModalProps {
  open: boolean;
  currentUrl: string;
  onClose: () => void;
}

const expirationOptions = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Never", value: "never" },
];

export default function DashboardSharingModal({
  open,
  currentUrl,
  onClose,
}: DashboardSharingModalProps) {
  const [expiration, setExpiration] = useState("30d");
  const [includeReadonly, setIncludeReadonly] = useState(true);

  const contentRef = useFocusTrap({
    isActive: open,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  });

  const shareUrl = useMemo(() => {
    const url = new URL(currentUrl);
    if (includeReadonly) {
      url.searchParams.set("share_readonly", "true");
    } else {
      url.searchParams.delete("share_readonly");
    }
    url.searchParams.set("share_expires", expiration);
    return url.toString();
  }, [currentUrl, expiration, includeReadonly]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close sharing modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-share-title"
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-stellar-border bg-stellar-dark shadow-2xl shadow-black/40"
      >
        <div className="border-b border-stellar-border bg-stellar-card/80 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="dashboard-share-title" className="text-xl font-semibold text-white">
                Share dashboard
              </h2>
              <p className="mt-1 text-sm text-stellar-text-secondary">
                Generate a read-only link for the current view and filters.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-stellar-text-secondary hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              aria-label="Close sharing"
            >
              x
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-stellar-text-secondary">
              <span>Expiration</span>
              <select
                value={expiration}
                onChange={(event) => setExpiration(event.target.value)}
                className="w-full rounded-md border border-stellar-border bg-stellar-card px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                {expirationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stellar-border bg-stellar-card p-3 text-sm text-stellar-text-primary">
              <input
                type="checkbox"
                checked={includeReadonly}
                onChange={(event) => setIncludeReadonly(event.target.checked)}
                className="h-4 w-4"
              />
              Read-only preview
            </label>
          </div>

          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <p className="text-xs uppercase text-stellar-text-secondary">Share link</p>
            <p className="mt-2 break-all text-sm text-white">{shareUrl}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={shareUrl} label="Copy link" copiedLabel="Copied" />
              <a
                href={shareUrl}
                className="inline-flex min-h-9 items-center rounded-md border border-stellar-border px-3 py-1.5 text-xs font-medium text-stellar-text-secondary hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                Open preview
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <p className="text-sm font-medium text-white">Permission hints</p>
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Shared links preserve filters, selected dashboard view, drawer state, and bridge
              status. Read-only links do not grant export or configuration permissions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
