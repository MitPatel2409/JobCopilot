import { useState } from "react";
import { Columns3, List as ListIcon, Search } from "lucide-react";
import { sendJson } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useStoredState } from "../hooks/useStoredState";
import { daysSince, formatShortDate } from "../utils/format";
import { FORWARD, STATUSES } from "../utils/status";
import StatusDialog from "./application/StatusDialog";
import MissingFlags from "./MissingFlags";
import PipelineBoard from "./PipelineBoard";
import { Empty, Input, LoadState, SegmentedControl, Select, StatusBadge } from "./ui";

const LAYOUTS = [
  { value: "list", label: "List", icon: ListIcon },
  { value: "board", label: "Board", icon: Columns3 },
];

const SORTS = {
  applied: { label: "Newest first", compare: (a, b) => b.applied_on.localeCompare(a.applied_on) || b.id - a.id },
  oldest: { label: "Oldest first", compare: (a, b) => a.applied_on.localeCompare(b.applied_on) || a.id - b.id },
  company: { label: "Company A–Z", compare: (a, b) => a.company.localeCompare(b.company) },
  updated: { label: "Recently updated", compare: (a, b) => b.updated_at.localeCompare(a.updated_at) },
};

const NEEDS_NOTE = new Set(["interview", "offer", "rejected"]);

function matches(application, query) {
  const text = `${application.company} ${application.role} ${application.notes}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
}

export default function ApplicationsTab({ refreshKey, onError, onChanged, onOpen, onInterview }) {
  const { data, loading, error } = useFetch("/applications", refreshKey);
  const [layout, setLayout] = useStoredState("jc-applications-layout", "list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("applied");
  const [moving, setMoving] = useState(null); // { application, status } waiting for its note

  if (!data) return <LoadState loading={loading} error={error} />;

  const applications = data.applications;
  const forward = applications.filter((a) => FORWARD.has(a.status)).length;
  const found = applications.filter((a) => matches(a, query.trim())).sort(SORTS[sort].compare);
  const shown = layout === "list" && filter !== "all" ? found.filter((a) => a.status === filter) : found;

  /** Big moves ask for a note (and the interview date) first, as in the side panel; the rest happen at once. */
  async function move(id, status) {
    if (NEEDS_NOTE.has(status)) {
      setMoving({ application: applications.find((a) => a.id === id), status });
      return;
    }
    try {
      await sendJson(`/applications/${id}`, "PATCH", { status });
      onChanged();
      if (status === "interview") onInterview(id);
    } catch (moveError) {
      onError(moveError.message);
    }
  }

  return (
    <div className="space-y-4">
      {moving && (
        <StatusDialog
          application={moving.application}
          status={moving.status}
          onClose={() => setMoving(null)}
          onSaved={(status) => {
            const id = moving.application.id;
            setMoving(null);
            onChanged();
            if (status === "interview") onInterview(id);
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, role or notes"
            aria-label="Search applications"
            className="pl-8"
          />
        </div>
        {layout === "list" && (
          <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status" className="!w-auto">
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        )}
        <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort" className="!w-auto">
          {Object.entries(SORTS).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <SegmentedControl label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
        </div>
      </div>

      <p className="text-xs text-muted">
        {shown.length === applications.length ? `${applications.length} applications` : `${shown.length} of ${applications.length} applications`}
        {applications.length > 0 && ` · ${forward} moved forward`}
      </p>

      {applications.length === 0 ? (
        <Empty>No applications yet. Add one with “New application”, or tell the assistant “I applied to …”.</Empty>
      ) : layout === "board" ? (
        <PipelineBoard applications={shown} onOpen={onOpen} onMove={move} />
      ) : shown.length === 0 ? (
        <Empty>No applications match.</Empty>
      ) : (
        <ApplicationTable applications={shown} onOpen={onOpen} />
      )}
    </div>
  );
}

function ApplicationTable({ applications, onOpen }) {
  const head = "px-4 py-2 text-left text-xs font-medium text-muted";
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-sunken/60">
          <tr>
            <th className={head}>Company</th>
            <th className={`${head} hidden sm:table-cell`}>Role</th>
            <th className={head}>Status</th>
            <th className={`${head} hidden md:table-cell`}>Applied</th>
            <th className={`${head} hidden text-right md:table-cell`}>Age</th>
            <th className={`${head} w-px`}>
              <span className="sr-only">Missing details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applications.map((application) => (
            <tr key={application.id} onClick={() => onOpen(application.id)} className="cursor-pointer hover:bg-sunken">
              <td className="max-w-0 px-4 py-2.5 sm:max-w-none">
                <button type="button" className="block max-w-full truncate text-left font-medium text-ink">
                  {application.company}
                </button>
                <span className="block truncate text-xs text-muted sm:hidden">{application.role}</span>
              </td>
              <td className="hidden max-w-56 truncate px-4 py-2.5 text-ink-soft sm:table-cell">{application.role || "–"}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={application.status} />
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 text-muted md:table-cell">{formatShortDate(application.applied_on)}</td>
              <td className="hidden whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted md:table-cell">
                {daysSince(application.applied_on)}d
              </td>
              <td className="px-4 py-2.5 text-right">
                <MissingFlags missing={application.missing} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
