/** Application statuses, in pipeline order, with their label and dot colour. */
export const STATUSES = [
  { value: "applied", label: "Applied", dot: "bg-zinc-400" },
  { value: "oa", label: "Online assessment", dot: "bg-amber-500" },
  { value: "interview", label: "Interview", dot: "bg-blue-500" },
  { value: "offer", label: "Offer", dot: "bg-emerald-500" },
  { value: "rejected", label: "Rejected", dot: "bg-red-500" },
  { value: "ghosted", label: "No reply", dot: "border border-zinc-400" },
];

const BY_VALUE = new Map(STATUSES.map((status) => [status.value, status]));

export function statusInfo(value) {
  return BY_VALUE.get(value) ?? { value, label: value, dot: "bg-zinc-400" };
}

/** Statuses that count as "moved forward". */
export const FORWARD = new Set(["oa", "interview", "offer"]);
