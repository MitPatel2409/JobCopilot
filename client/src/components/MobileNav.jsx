import { VIEWS } from "../utils/views";

/** Bottom navigation for phones, where the sidebar is hidden. */
export default function MobileNav({ view, onNavigate, dueCount }) {
  return (
    <nav className="flex shrink-0 border-t border-line bg-surface md:hidden" aria-label="Main">
      {VIEWS.map(({ id, label, icon }) => {
        const Icon = icon;
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-medium text-ink" : "text-muted"}`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
            {id === "today" && dueCount > 0 && <span className="absolute right-1/4 top-1.5 size-1.5 rounded-full bg-danger" aria-label={`${dueCount} due`} />}
          </button>
        );
      })}
    </nav>
  );
}
