import { AlertCircle, Bell, Check, MoonStar, X } from "lucide-react";

const ICONS = { reminder: Bell, nudge: MoonStar, error: AlertCircle, success: Check };
const ICON_TONES = { error: "text-danger", success: "text-good" };

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind] ?? Bell;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3 text-sm shadow-lg"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${ICON_TONES[toast.kind] ?? "text-muted"}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{toast.title}</p>
              {toast.body && <p className="text-muted">{toast.body}</p>}
            </div>
            <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss" className="text-faint hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
