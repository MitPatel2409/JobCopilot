import { ClipboardX, Link2Off, UserX } from "lucide-react";

const FLAGS = [
  { field: "url", label: "No posting link", icon: Link2Off },
  { field: "contact", label: "No recruiter saved", icon: UserX },
  { field: "jd", label: "No job description saved", icon: ClipboardX },
];

/** Small icons for what an application still lacks: the posting link, a recruiter, the job description. */
export default function MissingFlags({ missing }) {
  if (missing.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle text-faint">
      {FLAGS.filter(({ field }) => missing.includes(field)).map((flag) => {
        const Icon = flag.icon;
        return (
          <span key={flag.field} title={flag.label}>
            <Icon className="size-3.5" aria-label={flag.label} />
          </span>
        );
      })}
    </span>
  );
}
