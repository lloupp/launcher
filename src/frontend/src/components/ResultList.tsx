import { useEffect, useRef } from "react";
import type { SearchResult } from "../types";
import { ResultItem } from "./ResultItem";

interface ResultListProps {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
}

export function ResultList({ results, selectedIndex, onSelect, onActivate }: ResultListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!listRef.current || results.length === 0) return;
    const container = listRef.current;
    const selected = container.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (selected) {
      const rect = selected.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - rect.top + 8;
      } else if (rect.bottom > containerRect.bottom) {
        container.scrollTop += rect.bottom - containerRect.bottom + 8;
      }
    }
  }, [selectedIndex, results.length]);

  if (results.length === 0) return null;

  return (
    <div className="result-list" ref={listRef} role="listbox">
      {results.map((result, index) => (
        <ResultItem
          key={index}
          result={result}
          selected={index === selectedIndex}
          onClick={() => onActivate(index)}
        />
      ))}
    </div>
  );
}
