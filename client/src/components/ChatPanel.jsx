import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Square, X } from "lucide-react";
import ActionChips from "./ActionChips";
import { IconButton } from "./ui";

const EXAMPLES = [
  "Today I applied to RBC Amplify and studied Docker",
  "Got an interview with Shopify for Nov 3",
  "What's due this week?",
];

/** The assistant, docked on the right of the page (full screen on a phone). */
export default function ChatPanel({ chat, onClose }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  const busy = Boolean(chat.pending);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, chat.pending]);

  function submit(event) {
    event?.preventDefault();
    if (!draft.trim() || busy) return;
    chat.send(draft);
    setDraft("");
  }

  return (
    <section
      className="fixed inset-0 z-40 flex min-h-0 flex-col bg-surface lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-line xl:w-[400px]"
      aria-label="Assistant"
    >
      <header className="flex h-14 shrink-0 items-center border-b border-line pl-4 pr-2.5">
        <h2 className="flex-1 text-sm font-semibold text-ink">Assistant</h2>
        <IconButton label="Hide assistant" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {chat.messages.length === 0 && !busy && <Welcome onPick={(text) => chat.send(text)} />}

        {chat.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {busy && (
          <div className="space-y-2">
            <ActionChips actions={chat.pending.actions} />
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Working…
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {chat.error && (
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          <span className="flex-1">{chat.error}</span>
          <button type="button" onClick={chat.dismissError} aria-label="Dismiss error" className="opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-md border border-line-strong bg-surface p-2 focus-within:border-ink">
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) submit(event);
            }}
            rows={2}
            placeholder="Tell me what you did, or ask what's due"
            aria-label="Message"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 text-sm text-ink outline-none placeholder:text-faint"
          />
          {busy ? (
            <button type="button" onClick={chat.stop} className="rounded-md bg-sunken p-1.5 text-ink-soft hover:text-ink" aria-label="Stop">
              <Square className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-md bg-accent p-1.5 text-accent-fg hover:bg-accent-hover disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-xs text-faint">Enter to send. Nothing is ever emailed for you.</p>
      </form>
    </section>
  );
}

function Message({ message }) {
  const user = message.role === "user";
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">{user ? "You" : "Assistant"}</p>
      {!user && <ActionChips actions={message.actions ?? []} />}
      <p className={`whitespace-pre-wrap text-sm leading-relaxed text-ink ${user ? "rounded-md border border-line bg-sunken px-3 py-2" : ""}`}>
        {message.content}
      </p>
    </div>
  );
}

function Welcome({ onPick }) {
  return (
    <div className="py-4">
      <h3 className="text-sm font-semibold text-ink">Log your day in plain English</h3>
      <p className="mt-1 text-sm text-muted">
        Applications, follow-ups, recruiters and study sessions are saved from what you write. Try one:
      </p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button type="button" onClick={() => onPick(example)} className="w-full px-3 py-2 text-left text-sm text-ink-soft hover:bg-sunken">
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
