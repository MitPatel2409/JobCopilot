import { useFetch } from "../hooks/useFetch";
import { formatShortDate } from "../utils/format";
import { STATUSES, statusInfo } from "../utils/status";
import Stat from "./Stat";
import { Card, Empty, LoadState, SectionTitle } from "./ui";

const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function InsightsTab({ refreshKey }) {
  const { data, loading, error } = useFetch("/stats", refreshKey);
  if (!data) return <LoadState loading={loading} error={error} />;
  if (data.total === 0 && data.study.topics === 0) {
    return <Empty>Insights appear once you have logged an application or a study session.</Empty>;
  }

  const revisions = data.study.revisions_done + data.study.revisions_pending;

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applications" value={data.total} hint={`${data.weekly.at(-1).count} this week`} />
        <Stat label="Response rate" value={percent(data.replied, data.total)} hint={`${data.replied} of ${data.total} heard back`} />
        <Stat
          label="Median time to a reply"
          value={data.medianDaysToReply === null ? "–" : `${Math.round(data.medianDaysToReply)}d`}
          hint="From applying to first news"
        />
        <Stat label="Logging streak" value={`${data.streak}d`} hint="Days in a row with a journal entry" />
      </div>

      <section>
        <SectionTitle>Applications per week</SectionTitle>
        <Card className="px-4 pb-3 pt-5">
          <WeeklyChart weeks={data.weekly} />
        </Card>
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        <section>
          <SectionTitle>How far applications got</SectionTitle>
          <Card className="space-y-3 p-4">
            {data.funnel.map(({ stage, count }) => (
              <BarRow key={stage} label={statusInfo(stage).label} count={count} total={data.total} />
            ))}
            <p className="pt-1 text-xs text-muted">Each stage counts applications that reached it or went further.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Where they stand now</SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {STATUSES.map((status) => (
                  <tr key={status.value}>
                    <th scope="row" className="px-4 py-2 text-left font-normal text-ink-soft">
                      <span className="inline-flex items-center gap-2">
                        <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
                        {status.label}
                      </span>
                    </th>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{data.byStatus[status.value] ?? 0}</td>
                    <td className="w-16 px-4 py-2 text-right tabular-nums text-muted">
                      {percent(data.byStatus[status.value] ?? 0, data.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </div>

      <section>
        <SectionTitle>Study</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-ink-soft">
            {plural(data.study.topics, "topic")} · {plural(data.study.notes, "note")}
          </p>
          <BarRow label="Revisions done" count={data.study.revisions_done} total={revisions} />
        </Card>
      </section>
    </div>
  );
}

/** A labelled horizontal bar: `count` out of `total`, with both numbers written out. */
function BarRow({ label, count, total }) {
  return (
    <div className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm">
      <span className="truncate text-ink-soft">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="block h-full rounded-full bg-chart" style={{ width: total ? `${(count / total) * 100}%` : 0 }} />
      </span>
      <span className="text-right tabular-nums text-ink">
        {count}
        <span className="ml-1.5 text-xs text-muted">{total ? percent(count, total) : ""}</span>
      </span>
    </div>
  );
}

const CHART_HEIGHT = 144; // px

/** One bar per week. Hover or focus a bar for its count. */
function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const describe = (week) => `Week of ${formatShortDate(week.start)}: ${plural(week.count, "application")}`;

  return (
    <figure>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden>
          <span className="absolute -top-2 right-0 bg-surface pl-1.5 text-[11px] tabular-nums text-muted">{max}</span>
        </div>
        <div className="absolute inset-0 flex items-end gap-2 border-b border-line-strong pr-6 sm:gap-3">
          {weeks.map((week) => (
            <div key={week.start} tabIndex={0} role="img" aria-label={describe(week)} className="group relative flex h-full flex-1 items-end justify-center outline-none">
              <div
                className="w-full max-w-10 rounded-t bg-chart opacity-90 group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ height: week.count ? Math.max(4, (week.count / max) * CHART_HEIGHT) : 0 }}
              />
              <div aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow-lg group-hover:block group-focus-visible:block">
                {describe(week)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2 pr-6 sm:gap-3" aria-hidden>
        {weeks.map((week, index) => (
          <span key={week.start} className={`flex-1 truncate text-center text-[11px] text-muted ${index % 2 ? "" : "max-sm:invisible"}`}>
            {formatShortDate(week.start)}
          </span>
        ))}
      </div>
    </figure>
  );
}
