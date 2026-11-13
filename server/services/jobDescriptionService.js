/**
 * Job descriptions: saving the text, and fetching it from the posting link
 * so it is kept even after the posting comes down.
 *
 * Fetching runs on the server, so it only goes to public web addresses: the
 * host is resolved first and private, loopback and link-local addresses are
 * refused, at every redirect.
 */
const dns = require("node:dns/promises");
const net = require("node:net");
const { ValidationError } = require("../utils/errors");
const { requireApplication } = require("./applicationService");

const MAX_TEXT = 30000;
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 4;

function saveJobDescription(ctx, applicationId, text) {
  requireApplication(ctx, applicationId);
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT);
  return ctx.store.applications.update(applicationId, {
    jd_text: clean,
    jd_saved_at: clean ? ctx.clock().toISOString() : null,
  });
}

/**
 * Downloads `url` and returns the job description found in it, for the user
 * to check before saving. Prefers the description a page embeds for search
 * engines (schema.org JobPosting); otherwise the page's visible text.
 */
async function fetchJobDescription(url, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  const html = await fetchPublicPage(url, { fetchImpl, lookup });
  const text = (jobPostingDescription(html) ?? visibleText(html)).slice(0, MAX_TEXT).trim();
  if (text.length < 200) {
    throw new ValidationError(
      "That page did not have a readable job description (many job sites build the page in the browser). Copy the text from the posting and paste it instead.",
    );
  }
  return text;
}

async function fetchPublicPage(url, { fetchImpl, lookup }) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(current, lookup);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (Job-Copilot; saving a job description)", Accept: "text/html,text/plain" },
      });
    } catch {
      throw new ValidationError("The posting could not be reached. Paste the description instead.");
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = new URL(response.headers.get("location"), current).toString();
      continue;
    }
    if (!response.ok) throw new ValidationError(`The posting answered with an error (${response.status}). It may be offline; paste the description instead.`);
    if (!/text\/(html|plain)|application\/xhtml/.test(response.headers.get("content-type") ?? "")) {
      throw new ValidationError("That link is not a web page. Paste the description instead.");
    }
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new ValidationError("That page is too large to read.");
    return readCapped(response, MAX_BYTES);
  }
  throw new ValidationError("The posting redirected too many times.");
}

/** The response body as text, reading no more than `maxBytes` of it. */
async function readCapped(response, maxBytes) {
  if (!response.body) return "";
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}

async function assertPublicUrl(value, lookup) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("That is not a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ValidationError("Only http and https links can be fetched.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new ValidationError(`Could not find ${url.hostname}.`);
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new ValidationError("That link points to a private network address.");
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
}

/** The `description` of a schema.org JobPosting in the page's JSON-LD, as plain text. */
function jobPostingDescription(html) {
  for (const [, json] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findJobPosting(JSON.parse(json.trim()));
      if (found?.description) {
        const title = found.title ? `${found.title}\n\n` : "";
        return title + visibleText(decodeEntities(String(found.description)));
      }
    } catch {
      // not valid JSON: try the next block
    }
  }
  return null;
}

function findJobPosting(node) {
  if (Array.isArray(node)) return node.map(findJobPosting).find(Boolean);
  if (!node || typeof node !== "object") return null;
  const type = [].concat(node["@type"] ?? []);
  if (type.includes("JobPosting")) return node;
  return findJobPosting(node["@graph"]);
}

/** Readable text of an HTML page or fragment: scripts and navigation dropped, block elements on their own lines. */
function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/ul|\/ol)\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", hellip: "…" };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

module.exports = { saveJobDescription, fetchJobDescription, isPrivateAddress, visibleText, jobPostingDescription };
