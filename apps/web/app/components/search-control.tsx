"use client";

type SearchControlProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultSummary?: string;
  className?: string;
};

export function SearchControl({ value, onChange, placeholder, resultSummary, className }: SearchControlProps) {
  const classes = ["task-search", value ? "task-search-active" : "", className].filter(Boolean).join(" ");

  return (
    <label className={classes}>
      <span className="sr-only">Search</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value ? (
        <button type="button" className="task-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          Clear
        </button>
      ) : null}
      {resultSummary ? <span className="task-search-summary">{resultSummary}</span> : null}
    </label>
  );
}
