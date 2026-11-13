/** Small shared pieces used by every view. */
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { statusInfo } from "../utils/status";

const FIELD =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none disabled:opacity-50";

/** A status as a coloured dot and its name. */
export function StatusBadge({ status }) {
  const info = statusInfo(status);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-soft">
      <span className={`size-2 shrink-0 rounded-full ${info.dot}`} aria-hidden />
      {info.label}
    </span>
  );
}

export function SectionTitle({ children, count }) {
  return (
    <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
      {children}
      {count !== undefined && <span className="text-xs font-normal tabular-nums text-muted">{count}</span>}
    </h3>
  );
}

export function Empty({ children }) {
  return <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

/** Shows a spinner or error for a useFetch result, or nothing once data is there. */
export function LoadState({ loading, error }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  return null;
}

/** Rows in one bordered box, separated by hairlines. */
export function List({ className = "", ...props }) {
  return <ul className={`divide-y divide-line overflow-hidden rounded-md border border-line bg-surface ${className}`} {...props} />;
}

export function Card({ className = "", ...props }) {
  return <div className={`rounded-md border border-line bg-surface ${className}`} {...props} />;
}

export function Button({ variant = "secondary", size = "sm", className = "", ...props }) {
  const variants = {
    primary: "bg-accent text-accent-fg hover:bg-accent-hover",
    secondary: "border border-line-strong bg-surface text-ink-soft hover:bg-sunken",
    ghost: "text-muted hover:bg-sunken hover:text-ink",
    danger: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3 py-1.5 text-sm" };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium disabled:pointer-events-none disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

/** A square button that holds only an icon; `label` is read by screen readers and shown on hover. */
export function IconButton({ label, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`${FIELD} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`${FIELD} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }) {
  return <select className={`${FIELD} ${className}`} {...props} />;
}

/** A labelled form control. Pass the control as the only child. */
export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-baseline justify-between gap-2 font-medium text-ink-soft">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Two or more choices in one row, one of them on. */
export function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${
              value === option.value ? "bg-sunken text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A "⋯" button with a short list of actions. `items` is a list of
 * { label, icon, onSelect, danger }. Escape or a click elsewhere closes it.
 */
export function Menu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    // Capture phase, so Escape closes the menu and not the drawer around it.
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="size-7">
        <MoreHorizontal className="size-4" aria-hidden />
      </IconButton>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-md border border-line bg-surface p-1 shadow-lg">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-sunken ${item.danger ? "text-danger" : "text-ink-soft"}`}
              >
                {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-line-strong bg-sunken px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * A dialog over the page. Escape or a click outside closes it, Tab stays
 * inside it, and focus goes back to where it was when it closes.
 */
export function Modal({ title, onClose, children, footer, size = "max-w-md", position = "items-center" }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    if (!panel.contains(document.activeElement)) panel.focus();

    // Capture phase, so Escape closes this dialog and not the drawer under it.
    function onKey(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = [...panel.querySelectorAll(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/40 p-4 ${position}`}
      onMouseDown={(event) => {
        event.stopPropagation(); // a dialog opened from the drawer must not close the drawer too
        onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col rounded-lg border border-line bg-surface shadow-xl outline-none ${size}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title && (
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 id={titleId} className="flex-1 text-sm font-semibold text-ink">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose} className="-mr-1.5 size-7">
              <X className="size-4" aria-hidden />
            </IconButton>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = "Confirm", onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="max-w-sm"
      footer={
        <>
          <Button size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="px-4 py-4 text-sm text-ink-soft">{children}</p>
    </Modal>
  );
}
