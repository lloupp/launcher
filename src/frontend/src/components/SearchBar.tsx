import { useRef, type FormEvent } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  /** Optional placeholder. */
  placeholder?: string;
}

export function SearchBar({ value, onChange, loading, placeholder }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  if (inputRef.current && document.activeElement !== inputRef.current) {
    // Focus will be handled in useEffect below
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Enter is handled by useKeyboardNav, this is just to prevent form reload
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar__inner">
        <span className="search-bar__icon">
          {loading ? (
            <span className="spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <input
          ref={inputRef}
          className="search-bar__input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search apps, files, or calculate…"}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {value && (
          <button
            type="button"
            className="search-bar__clear"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
