import { readNdjson } from "./readNdjson";

// Set VITE_API_URL in client/.env for a deployed backend.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export const apiUrl = (path) => `${API_URL}${path}`;

export function getJson(path) {
  return request(path);
}

export function sendJson(path, method, body) {
  return request(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Uploads one file in the "file" field. */
export function uploadFile(path, file) {
  const form = new FormData();
  form.append("file", file);
  return request(path, { method: "POST", body: form });
}

/** Sends a chat message and calls `onEvent` for every streamed agent event. */
export async function streamChat({ message, onEvent, signal }) {
  const response = await fetch(apiUrl("/chat"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));

  await readNdjson(response.body, onEvent);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), { ...options, credentials: "include" });
  } catch {
    throw new Error("Can't reach the server. Is it running on port 5000?");
  }
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.status === 204 ? null : response.json();
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    return body.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}
