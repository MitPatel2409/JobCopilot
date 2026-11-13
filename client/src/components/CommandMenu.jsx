import { useState } from "react";
import { Briefcase, Search } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { describeApplication } from "../utils/format";
import { Kbd, Modal, StatusBadge } from "./ui";

const MAX_APPLICATIONS = 6;

/**
 * Ctrl+K: type to find a command or an application, then Enter.
 * `commands` is a list of { id, label, icon, shortcut, run }.
 */
export default function CommandMenu({ commands, onOpenApplication, onClose }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const { data } = useFetch("/applications");

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text) => words.every((word) => text.toLowerCase().includes(word));

  const applications = words.length === 0 ? [] : (data?.applications ?? []).filter((a) => has(describeApplication(a))).slice(0, MAX_APPLICATIONS);
  const items = [
    ...commands.filter((command) => has(command.label)),
    ...applications.map((application) => ({
      id: `application-${application.id}`,
      label: describeApplication(application),
      icon: Briefcase,
      status: application.status,
      run: () => onOpenApplication(application.id),
    })),
  ];
  const active = Math.min(index, items.length - 1);

  function choose(item) {
    onClose();
    item.run();
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0) setIndex((active + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      choose(items[active]);
    }
  }

  return (
    <Modal onClose={onClose} size="max-w-lg" position="items-start pt-[12vh]">
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-faint" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search applications or run a command"
          aria-label="Search applications or run a command"
          className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox" aria-label="Results">
          {items.map((item, position) => {
            const Icon = item.icon;
            return (
              <li key={item.id} role="option" aria-selected={position === active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => choose(item)}
                  onMouseMove={() => setIndex(position)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                    position === active ? "bg-sunken text-ink" : "text-ink-soft"
                  }`}
                >
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.status && <StatusBadge status={item.status} />}
                  {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
