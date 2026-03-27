import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/bridges", label: "Bridges" },
  { to: "/analytics", label: "Analytics" },
  { to: "/api-docs", label: "API Docs" },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="border-b border-stellar-border bg-stellar-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-white">
              Bridge Watch
            </Link>
            <div className="hidden md:flex space-x-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "bg-stellar-blue text-white"
                      : "text-stellar-text-secondary hover:text-white"
                  }`}
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
