import { Link, useLocation } from "react-router-dom";
import { SkeletonText } from "./Skeleton";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/bridges", label: "Bridges" },
  { to: "/transactions", label: "Transactions" },
  { to: "/analytics", label: "Analytics" },
];

interface NavbarProps {
  isLoading?: boolean;
}

export default function Navbar({ isLoading = false }: NavbarProps) {
  const location = useLocation();

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
    <nav className="border-b border-stellar-border bg-stellar-card" aria-label="Primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-stellar-card focus:px-3 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
      >
        Skip to content
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              to="/"
              className="text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card rounded-sm"
              aria-label="Bridge Watch home"
            >
              Bridge Watch
            </Link>
            <div className="hidden md:flex space-x-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={location.pathname === link.to ? "page" : undefined}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "bg-stellar-blue text-white"
                      : "text-stellar-text-secondary hover:text-white"
                  } focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="text-sm text-stellar-text-secondary">
            Stellar Network Monitor
          </div>
        </div>
      </div>
    </nav>
  );
}
