/**
 * useKeyboardNav — keyboard navigation for the result list.
 *
 * ArrowUp/ArrowDown to move selection, Enter to activate,
 * Escape to clear/close. Also handles Tab for section cycling.
 */

import { useCallback, useEffect } from "react";

interface UseKeyboardNavOptions {
  /** Number of selectable items. */
  itemCount: number;
  /** Currently selected index. */
  selectedIndex: number;
  /** Set selected index (clamped). */
  setSelectedIndex: (index: number) => void;
  /** Activate the item at selectedIndex. */
  onEnter: () => void;
  /** Clear search / close launcher. */
  onEscape: () => void;
}

export function useKeyboardNav({
  itemCount,
  selectedIndex,
  setSelectedIndex,
  onEnter,
  onEscape,
}: UseKeyboardNavOptions): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          if (itemCount === 0) return;
          const next = (selectedIndex + 1) % itemCount;
          setSelectedIndex(next);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (itemCount === 0) return;
          const prev = selectedIndex === 0 ? itemCount - 1 : selectedIndex - 1;
          setSelectedIndex(prev);
          break;
        }
        case "Enter": {
          e.preventDefault();
          onEnter();
          break;
        }
        case "Escape": {
          e.preventDefault();
          onEscape();
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (itemCount === 0) return;
          const dir = e.shiftKey ? -1 : 1;
          const next = (selectedIndex + dir + itemCount) % itemCount;
          setSelectedIndex(next);
          break;
        }
      }
    },
    [itemCount, selectedIndex, setSelectedIndex, onEnter, onEscape]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
