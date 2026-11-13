import { AlertTriangle, Bell, BookOpen, Briefcase, CheckCircle2, Mail, NotebookPen, TrendingUp, UserPlus } from "lucide-react";
import { describeAction } from "../utils/actions";

const ICONS = {
  job: Briefcase,
  reminder: Bell,
  status: TrendingUp,
  contact: UserPlus,
  mail: Mail,
  study: BookOpen,
  journal: NotebookPen,
  done: CheckCircle2,
  error: AlertTriangle,
};

const ICON_TONES = { good: "text-good", bad: "text-danger", default: "text-faint" };

/** What the assistant did for one reply, as a short list. */
export default function ActionChips({ actions }) {
  const chips = actions.flatMap(describeAction);
  if (chips.length === 0) return null;

  return (
    <ul className="space-y-1 border-l-2 border-line pl-3">
      {chips.map((chip, index) => {
        const Icon = ICONS[chip.kind] ?? CheckCircle2;
        return (
          <li key={index} className={`flex items-start gap-1.5 text-xs ${chip.tone === "bad" ? "text-danger" : "text-muted"}`}>
            <Icon className={`mt-px size-3.5 shrink-0 ${ICON_TONES[chip.tone ?? "default"]}`} aria-hidden />
            {chip.text}
          </li>
        );
      })}
    </ul>
  );
}
