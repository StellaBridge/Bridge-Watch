interface LoadingSpinnerProps {
  message?: string;
  progress?: number;
  className?: string;
  size?: "small" | "medium" | "large";
}

const sizeClasses = {
  small: "w-5 h-5",
  medium: "w-8 h-8",
  large: "w-12 h-12",
};

export default function LoadingSpinner({
  message = "Loading…",
  progress,
  className = "",
  size = "medium",
}: LoadingSpinnerProps) {
  const normalizedProgress = progress != null ? Math.min(100, Math.max(0, progress)) : undefined;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center p-6 rounded-lg bg-stellar-card border border-stellar-border ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className={`relative ${sizeClasses[size]}`}>
        <div className="absolute inset-0 rounded-full border-2 border-stellar-border" />
        <div className="absolute inset-0 rounded-full border-2 border-t-stellar-blue animate-spin" />
      </div>
      <p className="text-white text-sm font-medium">{message}</p>

      {normalizedProgress != null && (
        <div className="w-full h-2.5 bg-stellar-border rounded overflow-hidden">
          <div
            className="bg-stellar-blue h-full transition-all duration-500"
            style={{ width: `${normalizedProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
