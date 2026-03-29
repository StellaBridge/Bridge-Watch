import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { SkeletonText } from "./Skeleton";
import NotificationCenter from "./NotificationCenter";
import { useNotificationContext } from "../context/NotificationContext";
import { WatchlistSidebar } from "./WatchlistSidebar";
import ConnectionStatus from "./ConnectionStatus";

const navLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bridges", label: "Bridges" },
  { to: "/transactions", label: "Transactions" },
  { to: "/analytics", label: "Analytics" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/reports", label: "Reports" },
];

interface NavbarProps {
  isLoading?: boolean;
}

export default function Navbar({ isLoading = false }: NavbarProps) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useNotificationContext();
  const navRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <nav className="border-b border-stellar-border bg-stellar-card px-4 py-3" aria-label="Primary loading navigation">
        <div className="flex items-center gap-3">
          <SkeletonText width="110px" height="1rem" variant="title" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonText key={i} width="70px" height="1rem" variant="text" />
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-stellar-border bg-stellar-card sticky top-0 z-50" aria-label="Primary" ref={navRef}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-stellar-card focus:px-3 focus:py-2 focus:text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-stellar-card focus:px-3 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          Skip to content
        </a>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4 md:space-x-8">
            <Link
              to="/"
              className="text-xl font-bold text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card rounded-sm"
              aria-label="Bridge Watch home"
            >
              Bridge <span className="text-stellar-blue">Watch</span>
            </Link>
            <div className="hidden space-x-4 md:flex">
              {desktopNavItems.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={
                    isNavItemActive(location.pathname, link.to) ? "page" : undefined
                  }
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isNavItemActive(location.pathname, link.to)
                      ? "bg-stellar-blue text-white"
                      : "text-stellar-text-secondary hover:text-stellar-text-primary"
                  } focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="text-sm text-stellar-text-secondary">Stellar Network Monitor</div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsWatchlistOpen(true)}
              className="relative rounded-full p-2 text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              aria-label="Open Watchlist"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
            </button>
            <WatchlistSidebar
              isOpen={isWatchlistOpen}
              onClose={() => setIsWatchlistOpen(false)}
            />

            <div className="relative">
              <button
                onClick={() => setIsNotifOpen((current) => !current)}
                className={`relative rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  isNotifOpen
                    ? "bg-stellar-dark text-white"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
                aria-label={`${unreadCount} notifications`}
                aria-expanded={isNotifOpen}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-stellar-card bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              <NotificationCenter
                isOpen={isNotifOpen}
                onClose={() => setIsNotifOpen(false)}
              />
            </div>

            <div className="hidden sm:flex items-center gap-3 border-l border-stellar-border pl-4">
              <ConnectionStatus />
            </div>
            <HamburgerButton
              open={mobileOpen}
              onClick={() => setMobileOpen((current) => !current)}
            />
          </div>
        </div>
      </nav>
      <MobileMenu
        open={mobileOpen}
        pathname={location.pathname}
        onClose={() => setMobileOpen(false)}
      />
    </div>
  );
}
