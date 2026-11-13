/**
 * Display and date helpers. Times are shown, and dates typed into forms are
 * read, in the app's timezone (Settings), the same one the server uses, so
 * "9:00 tomorrow" means the same thing on both sides even when the browser
 * is set to another zone.
 */

let appTimeZone; // undefined until Settings load: the browser's own zone

export function setAppTimeZone(timeZone) {
  appTimeZone = timeZone || undefined;
}

export function getAppTimeZone() {
  return appTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatDateTime(iso) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: appTimeZone,
  }).format(new Date(iso));
}

/** An instant as ["YYYY-MM-DD", "HH:mm"] in the app's timezone, for date and time inputs. */
export function localParts(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return [`${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}`];
}

function utcDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "2026-10-29" → "Thu, Oct 29". Read as a calendar date, so no timezone shift. */
export function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date));
}

/** "2026-10-29" → "Oct 29". */
export function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date));
}

/** "2026-10-29" → "Thursday, October 29". */
export function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(utcDate(date));
}

/** The calendar date `days` from today in the app's timezone, as "YYYY-MM-DD". */
export function localDatePlus(days) {
  const today = utcDate(localParts(new Date().toISOString())[0]);
  today.setUTCDate(today.getUTCDate() + days);
  return today.toISOString().slice(0, 10);
}

/** Whole days from a calendar date until today (0 for today). */
export function daysSince(date) {
  return Math.max(0, Math.round((utcDate(localDatePlus(0)) - utcDate(date)) / 86400000));
}

/** 48213 → "47 KB", 2_400_000 → "2.3 MB". */
export function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isOverdue(iso) {
  return new Date(iso) < new Date();
}

export function describeApplication(application) {
  return [application.company, application.role].filter(Boolean).join(" – ");
}

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
