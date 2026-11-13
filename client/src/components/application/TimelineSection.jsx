import { formatDateTime } from "../../utils/format";
import { statusInfo } from "../../utils/status";
import { SectionTitle } from "../ui";

/** Every status change, oldest first, with its note. */
export default function TimelineSection({ events }) {
  return (
    <section>
      <SectionTitle>Progress</SectionTitle>
      <ol className="space-y-3 border-l border-line-strong pl-4">
        {events.map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className={`absolute -left-[1.3rem] top-1.5 size-2 rounded-full ring-4 ring-canvas ${statusInfo(event.to_status).dot}`} aria-hidden />
            <span className="font-medium text-ink">{statusInfo(event.to_status).label}</span>
            <span className="ml-2 text-xs text-muted">{formatDateTime(event.at)}</span>
            {event.note && <p className="mt-0.5 text-ink-soft">{event.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
