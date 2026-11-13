/**
 * Streams events to the browser as NDJSON: one JSON object per line.
 * Used for POST /chat instead of Server-Sent Events because EventSource
 * cannot send a POST body.
 *
 * `signal` is aborted if the browser disconnects, so long work can stop early.
 */
function openNdjsonStream(res) {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  const isOpen = () => !res.writableEnded && !res.destroyed;

  return {
    signal: abortController.signal,
    send(event) {
      if (isOpen()) res.write(`${JSON.stringify(event)}\n`);
    },
    end() {
      if (isOpen()) res.end();
    },
  };
}

module.exports = { openNdjsonStream };
