import type { StateCreator, StoreMutatorIdentifier } from "zustand";

type Logger = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string
) => StateCreator<T, Mps, Mcs>;

type LoggerImpl = <T>(
  f: StateCreator<T, [], []>,
  name?: string
) => StateCreator<T, [], []>;

const loggerImpl: LoggerImpl = (f, name) => (set, get, store) => {
  const loggedSet = (...args: Parameters<typeof set>) => {
    const prevState = get();
    set(...args);
    const nextState = get();
    const action = (args as unknown[])[2];

    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      console.group(`[Zustand] ${name || "Store"} - ${action || "action"}`);
      console.log("Previous state:", prevState);
      console.log("Next state:", nextState);
      console.groupEnd();
    }
  };

  return f(loggedSet as typeof set, get, store);
};

export const logger = loggerImpl as Logger;

// Middleware to track state changes for analytics/metrics
export interface StateChangeMetric {
  storeName: string;
  actionName: string;
  timestamp: number;
  duration: number;
}

export const stateMetricsMiddleware = <T>(
  f: StateCreator<T, [], []>,
  storeName: string,
  onMetric?: (metric: StateChangeMetric) => void
): StateCreator<T, [], []> => {
  return (set, get, store) => {
    const wrappedSet = (...args: Parameters<typeof set>) => {
      const start = performance.now();
      const action = (args as unknown[])[2];
      const actionName = typeof action === "string" ? action : "unknown";

      set(...args);

      const duration = performance.now() - start;
      const metric: StateChangeMetric = {
        storeName,
        actionName,
        timestamp: Date.now(),
        duration,
      };

      if (onMetric) {
        onMetric(metric);
      }
    };

    return f(wrappedSet as typeof set, get, store);
  };
};

// Error boundary middleware
export const errorBoundaryMiddleware = <T>(
  f: StateCreator<T, [], []>,
  onError?: (error: Error, actionName: string) => void
): StateCreator<T, [], []> => {
  return (set, get, store) => {
    const wrappedSet = (...args: Parameters<typeof set>) => {
      try {
        set(...args);
      } catch (error) {
        const action = (args as unknown[])[2];
        const actionName = typeof action === "string" ? action : "unknown";

        if (onError && error instanceof Error) {
          onError(error, actionName);
        } else {
          console.error(`[Zustand Error] Action "${actionName}" failed:`, error);
        }

        throw error;
      }
    };

    return f(wrappedSet as typeof set, get, store);
  };
};
