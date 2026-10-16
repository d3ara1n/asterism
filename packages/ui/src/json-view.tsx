export function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}
