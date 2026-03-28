import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import {
  isNavItemActive,
  navGroups,
  type NavGroup,
} from "./navigation";

interface MobileMenuProps {
  open: boolean;
  pathname: string;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export default function MobileMenu({
  open,
  pathname,
  onClose,
}: MobileMenuProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () =>
      navGroups.reduce<Record<string, boolean>>((accumulator, group) => {
        accumulator[group.id] = true;
        return accumulator;
      }, {})
  );
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initialTouchX = useRef<number | null>(null);

  const activeGroupIds = useMemo(
    () =>
      navGroups
        .filter((group) =>
          group.items.some((item) => isNavItemActive(pathname, item.to))
        )
        .map((group) => group.id),
    [pathname]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR
      );
      firstFocusable?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!panelRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => !element.hasAttribute("disabled"));

      if (!focusable.length) {
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusable.length - 1
          : currentIndex - 1
        : currentIndex === focusable.length - 1
          ? 0
          : currentIndex + 1;

      if (currentIndex !== -1) {
        event.preventDefault();
        focusable[nextIndex]?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!activeGroupIds.length) {
      return;
    }
    setExpandedGroups((current) => {
      const next = { ...current };
      activeGroupIds.forEach((groupId) => {
        next[groupId] = true;
      });
      return next;
    });
  }, [activeGroupIds]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    initialTouchX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = initialTouchX.current;
    const endX = event.changedTouches[0]?.clientX ?? null;
    if (startX !== null && endX !== null && startX - endX > 70) {
      onClose();
    }
    initialTouchX.current = null;
  };

  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close mobile menu"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        id="mobile-navigation-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`absolute right-0 top-0 flex h-full w-[min(92vw,24rem)] flex-col border-l border-stellar-border bg-stellar-dark/95 px-5 pb-6 pt-5 shadow-2xl shadow-black/40 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">
              Bridge Watch
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Control surface
            </h2>
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Swipe left or use Escape to close.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            Close
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-stellar-border bg-stellar-card/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Account
          </p>
          <p className="mt-2 text-base font-medium text-white">Wave Operator</p>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Mobile command center for bridge monitoring and admin actions.
          </p>
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto" aria-label="Mobile navigation">
          <div className="space-y-4">
            {navGroups.map((group: NavGroup) => {
              const isExpanded = expandedGroups[group.id];
              return (
                <section
                  key={group.id}
                  className="rounded-2xl border border-stellar-border bg-stellar-card/70 p-3"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                  >
                    <span>
                      <span className="block text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
                        {group.label}
                      </span>
                      <span className="mt-1 block text-sm font-medium text-white">
                        {group.items.length} destinations
                      </span>
                    </span>
                    <span className="text-stellar-text-secondary">
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {group.items.map((item) => {
                        const isActive = isNavItemActive(pathname, item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={onClose}
                            className={`block rounded-2xl border px-3 py-3 transition focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                              isActive
                                ? "border-stellar-blue bg-stellar-blue/15 text-white"
                                : "border-transparent bg-stellar-dark/60 text-stellar-text-secondary hover:border-stellar-border hover:text-white"
                            }`}
                          >
                            <span className="block text-sm font-medium">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-xs text-inherit/80">
                              {item.description}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </nav>

        <div className="mt-6 rounded-2xl border border-stellar-border bg-stellar-card/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Quick actions
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              to="/analytics"
              onClick={onClose}
              className="rounded-2xl bg-stellar-blue px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            >
              Open analytics
            </Link>
            <Link
              to="/admin/api-keys"
              onClick={onClose}
              className="rounded-2xl border border-stellar-border px-4 py-3 text-center text-sm font-medium text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            >
              Manage keys
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
