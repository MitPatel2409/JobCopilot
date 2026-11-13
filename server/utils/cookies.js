/** Reading and writing cookies without a library. */

function parseCookies(header = "") {
  const cookies = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      // a malformed cookie from somewhere else: ignore it
    }
  }
  return cookies;
}

/**
 * Always HttpOnly (page scripts cannot read it) and SameSite=Lax (sent on the
 * redirect back from Google, not on requests started by other sites).
 */
function setCookie(res, name, value, { maxAgeSeconds, path = "/", secure = false }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function clearCookie(res, name, { path = "/", secure = false } = {}) {
  setCookie(res, name, "", { maxAgeSeconds: 0, path, secure });
}

module.exports = { parseCookies, setCookie, clearCookie };
