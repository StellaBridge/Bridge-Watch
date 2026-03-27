export interface LoadingSpinnerProps {
  size?: number;
  message?: string;
  progress?: number;
  showProgress?: boolean;
  className?: string;
}

export default function LoadingSpinner({
  size = 32,
  message = "Loading",
  progress,
  showProgress = false,
  className,
}: LoadingSpinnerProps) {
  const spinSize = `${size}px`;
  const clampedProgress = progress != null ? Math.min(100, Math.max(0, progress)) : undefined;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className ?? ""}`}>
      <div
        className="h-10 w-10 rounded-full border-4 border-stellar-border border-t-stellar-blue animate-spin"
        style={{ width: spinSize, height: spinSize }}
        aria-label={message}
        role="status"
      />
      <span className="text-sm text-stellar-text-secondary">{message}</span>
      {showProgress && (
        <div className="w-full max-w-xs rounded-full bg-stellar-border overflow-hidden h-2">
          <div
            className="h-full bg-stellar-blue transition-all duration-500"
            style={{ width: clampedProgress != null ? `${clampedProgress}%` : "100%" }}
            aria-valuenow={clampedProgress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      )}
    </div>
  );
}

export function LoadingProgress({ value }: { value?: number }) {
  const progress = value != null ? Math.min(100, Math.max(0, value)) : undefined;

  return (
    <div className="mt-2 w-full h-1 bg-stellar-border rounded-full overflow-hidden" aria-hidden="true">
      <div
        className="h-full bg-stellar-blue transition-all duration-300"
        style={{ width: progress ? `${progress}%` : "100%" }}
      />
    </div>
  );
}
