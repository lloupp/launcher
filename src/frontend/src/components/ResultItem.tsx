import type { SearchResult } from "../types";

interface ResultItemProps {
  result: SearchResult;
  selected: boolean;
  onClick: () => void;
}

/** Icon for each result type. */
function ResultIcon({ result }: { result: SearchResult }) {
  switch (result.type) {
    case "app":
      return <span className="result-icon result-icon--app">📦</span>;
    case "file":
      return <span className="result-icon result-icon--file">{result.file.isDirectory ? "📁" : "📄"}</span>;
    case "calc":
      return <span className="result-icon result-icon--calc">🧮</span>;
    case "clipboard":
      return <span className="result-icon result-icon--clip">📋</span>;
    case "extension":
      return <span className="result-icon result-icon--ext">🧩</span>;
    case "ai":
      return <span className="result-icon result-icon--ai">🤖</span>;
  }
}

/** Primary + secondary text lines. */
function ResultText({ result }: { result: SearchResult }) {
  switch (result.type) {
    case "app":
      return (
        <>
          <span className="result-item__title">{result.app.name}</span>
          <span className="result-item__subtitle">{result.app.path}</span>
        </>
      );
    case "file":
      return (
        <>
          <span className="result-item__title">{result.file.name}</span>
          <span className="result-item__subtitle">{result.file.path}</span>
        </>
      );
    case "calc":
      return (
        <>
          <span className="result-item__title">{result.calc.formatted ?? result.calc.result}</span>
          <span className="result-item__subtitle">Calculator</span>
        </>
      );
    case "clipboard":
      return (
        <>
          <span className="result-item__title">
            {result.entry.kind === "text"
              ? (result.entry.text ?? "").slice(0, 80)
              : result.entry.kind === "files"
                ? `${result.entry.paths?.length ?? 0} files`
                : "Image"}
          </span>
          <span className="result-item__subtitle">
            {new Date(result.entry.timestamp).toLocaleTimeString()}
          </span>
        </>
      );
    case "extension":
      return (
        <>
          <span className="result-item__title">{result.extension.name}: {result.commandName}</span>
          <span className="result-item__subtitle">{result.extension.description}</span>
        </>
      );
    case "ai":
      return (
        <>
          <span className="result-item__title">Ask AI: "{result.query}"</span>
          <span className="result-item__subtitle">Press Enter to chat with AI</span>
        </>
      );
  }
}

export function ResultItem({ result, selected, onClick }: ResultItemProps) {
  return (
    <div
      className={"result-item" + (selected ? " result-item--selected" : "")}
      onClick={onClick}
      role="option"
      aria-selected={selected}
    >
      <ResultIcon result={result} />
      <div className="result-item__text">
        <ResultText result={result} />
      </div>
      <span className="result-item__badge">{result.type}</span>
    </div>
  );
}
