import { Kbd, Modal } from "./ui";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], label: "Search applications or run a command" },
  { keys: ["1", "–", "6"], label: "Go to Today, Applications, Study, Journal, Insights, Settings" },
  { keys: ["/"], label: "Write to the assistant" },
  { keys: ["A"], label: "Show or hide the assistant" },
  { keys: ["N"], label: "New application" },
  { keys: ["R"], label: "New reminder" },
  { keys: ["S"], label: "Log a study session" },
  { keys: ["J"], label: "Add a line to today's journal" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["Esc"], label: "Close a dialog or panel" },
];

export default function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="divide-y divide-line px-4 py-1 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-ink-soft">{shortcut.label}</dt>
            <dd className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (key === "–" ? <span key={key} className="text-faint">–</span> : <Kbd key={key}>{key}</Kbd>))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
