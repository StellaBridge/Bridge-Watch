/**
 * Session Timeout Modal
 * Warns users before automatic logout with countdown timer
 */

import { useEffect, useState, useCallback } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface SessionTimeoutModalProps {
  isOpen: boolean;
  timeoutSeconds: number;
  onExtendSession: () => void;
  onLogout: () => void;
}

export function SessionTimeoutModal({
  isOpen,
  timeoutSeconds,
  onExtendSession,
  onLogout,
}: SessionTimeoutModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(timeoutSeconds);

  const contentRef = useFocusTrap({
    isActive: isOpen,
    onEscape: onExtendSession,
    returnFocusOnDeactivate: true,
  });

  useEffect(() => {
    if (!isOpen) {
      setSecondsRemaining(timeoutSeconds);
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, timeoutSeconds, onLogout]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const handleExtend = useCallback(() => {
    setSecondsRemaining(timeoutSeconds);
    onExtendSession();
  }, [timeoutSeconds, onExtendSession]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="presentation"
    >
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
          <svg
            className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="session-timeout-title"
          className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2"
        >
          Session Expiring Soon
        </h2>

        {/* Description */}
        <p
          id="session-timeout-description"
          className="text-center text-gray-600 dark:text-gray-300 mb-6"
        >
          Your session will expire in{" "}
          <span className="font-bold text-yellow-600 dark:text-yellow-400">
            {formatTime(secondsRemaining)}
          </span>
          . Would you like to stay logged in?
        </p>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
          <div
            className="bg-yellow-600 dark:bg-yellow-400 h-2 rounded-full transition-all duration-1000"
            style={{
              width: `${(secondsRemaining / timeoutSeconds) * 100}%`,
            }}
            role="progressbar"
            aria-valuenow={secondsRemaining}
            aria-valuemin={0}
            aria-valuemax={timeoutSeconds}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Log out now"
          >
            Log Out
          </button>
          <button
            onClick={handleExtend}
            className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Stay logged in"
            autoFocus
          >
            Stay Logged In
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          Press{" "}
          <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
            Enter
          </kbd>{" "}
          to stay logged in
        </p>
      </div>
    </div>
  );
}


