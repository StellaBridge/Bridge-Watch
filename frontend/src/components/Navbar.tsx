import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useNotificationLiveUpdates } from "../hooks/useNotificationLiveUpdates";
import { useWatchlist } from "../hooks/useWatchlist";
import {
  selectCriticalCount,
  selectUnreadCount,
  useNotificationStore,
} from "../stores/notificationStore";
import EntitySwitcher from "./EntitySwitcher";
import HamburgerButton from "./MobileNav/HamburgerButton";
import MobileMenu from "./MobileNav/MobileMenu";
import { isNavItemActive } from "./MobileNav/navigation";
import { useTranslatedDesktopNavItems } from "../hooks/useTranslatedNav";
import NotificationsDrawer from "./NotificationsDrawer";
import GlobalSearch from "./search/GlobalSearch";
import UnreadCountBadge from "./UnreadCountBadge";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const location = useLocation();
  const desktopNavItems = useTranslatedDesktopNavItems();
  const { activeSymbols } = useWatchlist();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const notificationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousDrawerOpen = useRef(false);
  const unreadCount = useNotificationStore(selectUnreadCount);
  const criticalCount = useNotificationStore(selectCriticalCount);

  useNotificationLiveUpdates();

  useEffect(() => {
    if (previousDrawerOpen.current && !isNotificationsOpen) {
      notificationTriggerRef.current?.focus();
    }
    previousDrawerOpen.current = isNotificationsOpen;
  }, [isNotificationsOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav className="border-b border-stellar-border bg-stellar-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-6">
              <Link to="/dashboard" className="shrink-0 text-xl font-bold text-white">
                Bridge Watch
              </Link>

              <div className="hidden items-center gap-1 xl:flex" aria-label="Primary navigation">
                {desktopNavItems.slice(0, 8).map((item) => {
                  const active = isNavItemActive(location.pathname, item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-stellar-blue/20 text-white"
                          : "text-stellar-text-secondary hover:bg-stellar-dark hover:text-white"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {/* #1241 — Public service status & uptime page */}
                <Link
                  to="/status"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    location.pathname === "/status"
                      ? "bg-stellar-blue/20 text-white"
                      : "text-stellar-text-secondary hover:bg-stellar-dark hover:text-white"
                  }`}
                  aria-current={location.pathname === "/status" ? "page" : undefined}
                >
                  Status
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:block">
                <GlobalSearch />
              </div>
              <div className="hidden md:block">
                <EntitySwitcher />
              </div>
              <button
                type="button"
                className="hidden rounded-md px-2 py-1 text-sm text-stellar-text-secondary hover:bg-stellar-dark hover:text-white lg:inline-flex"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("bridgewatch:open-shortcuts"))
                }
                aria-label="Keyboard shortcuts"
              >
                ?
              </button>
              <div className="hidden items-center gap-2 text-xs text-stellar-text-secondary lg:flex">
                <span>Quick:</span>
                {activeSymbols.length === 0 ? (
                  <span>No watchlist assets</span>
                ) : (
                  activeSymbols.slice(0, 3).map((symbol) => (
                    <Link
                      key={symbol}
                      to={`/assets/${symbol}`}
                      className="rounded border border-stellar-border px-2 py-1 hover:text-white"
                    >
                      {symbol}
                    </Link>
                  ))
                )}
              </div>

              <div className="hidden lg:block">
                <ThemeToggle />
              </div>

              <button
                ref={notificationTriggerRef}
                type="button"
                onClick={() => setIsNotificationsOpen((open) => !open)}
                className={`relative rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  isNotificationsOpen
                    ? "bg-stellar-blue/20 text-white"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
                aria-label={
                  isNotificationsOpen
                    ? "Close notifications"
                    : unreadCount > 0
                    ? `Open notifications (${unreadCount} unread)`
                    : "Open notifications"
                }
                aria-expanded={isNotificationsOpen}
                aria-controls="notifications-drawer"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <UnreadCountBadge unreadCount={unreadCount} />
                {criticalCount > 0 && (
                  <span
                    className="absolute top-1 left-1 flex h-2.5 w-2.5"
                    role="status"
                    aria-label={`${criticalCount} unacknowledged critical alerts`}
                  >
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"
                      aria-hidden="true"
                    />
                    <span
                      className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"
                      aria-hidden="true"
                    />
                  </span>
                )}
              </button>

              <Link
                to="/settings"
                className="rounded-full p-2 text-stellar-text-secondary hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                aria-label="User settings"
                title="User settings"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </Link>

              <HamburgerButton
                open={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen((open) => !open)}
              />
            </div>
          </div>
        </div>
      </nav>

      <NotificationsDrawer
        open={isNotificationsOpen}
        drawerId="notifications-drawer"
        onClose={() => setIsNotificationsOpen(false)}
      />
      <MobileMenu
        open={isMobileMenuOpen}
        pathname={location.pathname}
        onClose={() => setIsMobileMenuOpen(false)}
      />
    </>
  );
}
