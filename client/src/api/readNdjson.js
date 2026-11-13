/**
 * Reads a streamed NDJSON response body (one JSON object per line) and calls
 * `onEvent` for each object as soon as its line arrives.
 */
export async function readNdjson(body, onEvent) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop(); // the last piece may be an incomplete line

    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
