/**
 * Starts the app for a test context on a free port and returns a fetch helper.
 *
 *   request(path, { method, body, form, headers })
 *     body  sent as JSON;  form  a FormData (file uploads)
 *   → { status, text, buffer, json, headers }
 *   request.withHost(path, host) → status code
 */
const http = require("node:http");
const { createApp } = require("../../app");

async function startServer(t, ctx) {
  const server = createApp(ctx.app).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = "GET", body, form, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = buffer.toString("utf8");
    return {
      status: response.status,
      text,
      buffer,
      headers: response.headers,
      json: text && !text.includes("\n{") ? safeJson(text) : null,
    };
  };
  /** GET with a chosen Host header, which fetch does not allow setting. */
  request.withHost = (path, host) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port: server.address().port, path, headers: { Host: host } }, (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        })
        .on("error", reject);
    });
  return request;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The value of cookie `name` in a response's Set-Cookie headers, or undefined. */
function cookieFrom(headers, name) {
  for (const line of headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return undefined;
}

module.exports = { startServer, cookieFrom };
