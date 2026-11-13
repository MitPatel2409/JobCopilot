import { useState } from "react";
import { daysSince } from "../utils/format";
import { STATUSES } from "../utils/status";
import MissingFlags from "./MissingFlags";

/**
 * Applications as one column per status. Drag a card to another column to
 * change its status; the "Move to" menu on each card does the same without a mouse.
 */
export default function PipelineBoard({ applications, onOpen, onMove }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);

  function drop(event, status) {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/plain"));
    const application = applications.find((a) => a.id === id);
    if (application && application.status !== status) onMove(id, status);
    setDraggingId(null);
    setOverStatus(null);
  }

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
      {STATUSES.map((status) => {
        const cards = applications.filter((a) => a.status === status.value);
        const over = overStatus === status.value;
        return (
          <section
            key={status.value}
            aria-label={status.label}
            onDragOver={(event) => {
              event.preventDefault();
              setOverStatus(status.value);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setOverStatus(null);
            }}
            onDrop={(event) => drop(event, status.value)}
            className={`flex w-56 shrink-0 flex-col rounded-md border bg-sunken/60 ${over ? "border-ink" : "border-line"}`}
          >
            <h3 className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-ink-soft">
              <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
              {status.label}
              <span className="ml-auto tabular-nums text-muted">{cards.length}</span>
            </h3>
            <ul className="min-h-16 flex-1 space-y-2 px-2 pb-2">
              {cards.map((application) => (
                <li
                  key={application.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", String(application.id));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(application.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverStatus(null);
                  }}
                  className={`cursor-grab rounded-md border border-line bg-surface p-2.5 active:cursor-grabbing ${
                    draggingId === application.id ? "opacity-40" : ""
                  }`}
                >
                  <button type="button" onClick={() => onOpen(application.id)} className="block w-full text-left">
                    <span className="block truncate text-sm font-medium text-ink">{application.company}</span>
                    <span className="block truncate text-xs text-muted">{application.role || "No role"}</span>
                  </button>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <span className="whitespace-nowrap tabular-nums">{daysSince(application.applied_on)}d ago</span>
                    <MissingFlags missing={application.missing} />
                    <select
                      value=""
                      onChange={(event) => onMove(application.id, event.target.value)}
                      aria-label={`Move ${application.company} to`}
                      className="ml-auto w-16 appearance-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted hover:border-line-strong hover:text-ink"
                    >
                      <option value="" disabled>
                        Move to
                      </option>
                      {STATUSES.filter((option) => option.value !== application.status).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
