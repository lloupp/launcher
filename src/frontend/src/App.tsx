import { useCallback, useEffect, useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { ResultList } from "./components/ResultList";
import { useWebSocket } from "./hooks/useWebSocket";
import { useLauncherSearch } from "./hooks/useLauncherSearch";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import type { SearchResult } from "./types";

export function App() {
  const { status, request } = useWebSocket("ws://127.0.0.1:7270");
  const { state, search, clear } = useLauncherSearch(request);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Sync query to search hook
  useEffect(() => {
    search(query);
  }, [query, search]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [state.results]);

  // Activate a result (Enter or click)
  const activate = useCallback(
    async (index: number) => {
      const result = state.results[index];
      if (!result) return;

      switch (result.type) {
        case "app":
          await request("app.launch", { id: result.app.id });
          break;
        case "file":
          // Open file in default handler
          await request("file.info", { path: result.file.path });
          break;
        case "calc":
          // Copy result to clipboard
          await request("clipboard.copy", { text: result.calc.result });
          break;
        case "clipboard": {
          await request("clipboard.paste", { id: result.entry.id });
          break;
        }
        case "extension":
          await request("extension.invoke", {
            extensionId: result.extension.id,
            commandName: result.commandName,
          });
          break;
        case "ai": {
          // Will be handled by AI panel (future)
          break;
        }
      }
      // Close launcher after action
      clear();
      setQuery("");
    },
    [state.results, request, clear]
  );

  // Escape clears the search or closes the launcher
  const handleEscape = useCallback(() => {
    if (query) {
      setQuery("");
    }
    // In the host app, sending empty message closes the window
    // For browser dev, just clear
  }, [query]);

  useKeyboardNav({
    itemCount: state.results.length,
    selectedIndex,
    setSelectedIndex,
    onEnter: () => activate(selectedIndex),
    onEscape: handleEscape,
  });

  return (
    <div className="launcher">
      {/* Connection status indicator */}
      <div className={"status-bar" + (status === "connected" ? " status-bar--connected" : "")}>
        <span className="status-bar__dot" />
        <span className="status-bar__text">{status}</span>
      </div>

      <SearchBar value={query} onChange={setQuery} loading={state.loading} />

      {state.error && (
        <div className="error-banner">{state.error}</div>
      )}

      <ResultList
        results={state.results}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onActivate={activate}
      />

      {state.results.length === 0 && query.trim() && !state.loading && (
        <div className="empty-state">
          <p>No results found</p>
        </div>
      )}

      {/* Footer hint */}
      <div className="footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>Enter</kbd> select</span>
        <span><kbd>Esc</kbd> clear</span>
      </div>
    </div>
  );
}
