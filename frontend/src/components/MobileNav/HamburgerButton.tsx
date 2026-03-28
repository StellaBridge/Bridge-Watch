interface HamburgerButtonProps {
  open: boolean;
  onClick: () => void;
}

export default function HamburgerButton({
  open,
  onClick,
}: HamburgerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="mobile-navigation-panel"
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stellar-border bg-stellar-card/90 text-white shadow-lg shadow-black/20 transition hover:border-stellar-blue hover:text-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue md:hidden"
    >
      <span className="relative h-4 w-5">
        <span
          className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${
            open ? "translate-y-[7px] rotate-45" : ""
          }`}
        />
        <span
          className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-300 ${
            open ? "opacity-0" : "opacity-100"
          }`}
        />
        <span
          className={`absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${
            open ? "-translate-y-[7px] -rotate-45" : ""
          }`}
        />
      </span>
    </button>
  );
}
