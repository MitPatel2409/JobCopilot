/** One headline number with its label, and an optional line of detail under it. */
export default function Stat({ label, value, hint, tone = "text-ink" }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
