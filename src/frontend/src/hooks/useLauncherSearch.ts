/**
 * useLauncherSearch — unified debounced search across all backend handlers.
 *
 * Given a query string, it fans out to app.search, file.search, and
 * calc.evaluate in parallel, then merges results into a single
 * SearchResult[] array sorted by relevance.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult, AppEntry, FileEntry, CalcResult } from "../types";
import type { useWebSocket } from "./useWebSocket";

type RequestFn = ReturnType<typeof useWebSocket>["request"];

interface SearchState {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 80;

/** Detect if a string looks like a math expression. */
function looksLikeMath(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  // Must contain at least one digit and one operator/function
  const hasDigit = /[0-9]/.test(trimmed);
  const hasOp = /[+\-*/%^(),]|sqrt|sin|cos|tan|pow|log|ln|abs|round|floor|ceil|exp|pi|e(?![a-z])/i.test(trimmed);
  return hasDigit && hasOp;
}

export function useLauncherSearch(request: RequestFn): {
  state: SearchState;
  search: (query: string) => void;
  clear: () => void;
} {
  const [state, setState] = useState<SearchState>({
    results: [],
    loading: false,
    error: null,
  });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryId = useRef(0);

  const search = useCallback(
    (query: string) => {
      // Cancel any pending debounce
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const queryId = ++currentQueryId.current;

      if (!query.trim()) {
        setState({ results: [], loading: false, error: null });
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      debounceTimer.current = setTimeout(async () => {
        const promises: Promise<SearchResult[]>[] = [];

        // 1. App search (always)
        promises.push(
          request<{ apps: AppEntry[]; total: number }>("app.search", { query, limit: 8 })
            .then((data) => (data.apps ?? []).map((app) => ({ type: "app" as const, app })))
            .catch(() => [])
        );

        // 2. File search (only if query length >= 3 to reduce noise)
        if (query.trim().length >= 3) {
          promises.push(
            request<{ files: FileEntry[]; total: number; elapsed: number }>("file.search", { query, limit: 8 })
              .then((data) => (data.files ?? []).map((file) => ({ type: "file" as const, file })))
              .catch(() => [])
          );
        }

        // 3. Calculator (only if query looks like math)
        if (looksLikeMath(query)) {
          promises.push(
            request<CalcResult>("calc.evaluate", { expression: query })
              .then((calc) => [{ type: "calc" as const, calc }])
              .catch(() => [])
          );
        }

        const settled = await Promise.all(promises);
        const all = settled.flat();

        // Avoid race: only apply if this query is still the latest
        if (queryId === currentQueryId.current) {
          setState({ results: all, loading: false, error: null });
        }
      }, DEBOUNCE_MS);
    },
    [request]
  );

  const clear = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    currentQueryId.current++;
    setState({ results: [], loading: false, error: null });
  }, []);

  return { state, search, clear };
}
