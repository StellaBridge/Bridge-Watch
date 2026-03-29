import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { usePreferences } from "../context/PreferencesContext";
import { useToast } from "../context/ToastContext";

export default function AppQueryClientProvider({ children }: { children: ReactNode }) {
  const { showError } = useToast();
  const {
    prefs: { dataRefreshMs },
  } = usePreferences();

  const queryClient = useMemo(() => {
    return new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (query.state.data !== undefined) return;
          const msg = error instanceof Error ? error.message : String(error);
          showError(msg);
        },
      }),
      mutationCache: new MutationCache({
        onError: (error) => {
          const msg = error instanceof Error ? error.message : String(error);
          showError(msg);
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: Math.min(30_000, dataRefreshMs),
          refetchInterval: dataRefreshMs,
          refetchOnWindowFocus: false,
        },
      },
    });
  }, [showError, dataRefreshMs]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
