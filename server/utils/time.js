/**
 * Date helpers that work in the user's timezone without a date library.
 *
 * Two kinds of value are stored:
 *   - calendar dates ("2026-10-29") for things like when you applied, in local time
 *   - instants (ISO strings in UTC) for reminder due times
 */
const { ValidationError } = require("./errors");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/;

function partsIn(date, timeZone) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  });
  return Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]));
}

/** "2026-10-29": the calendar date of `date` in `timeZone`. */
function localDate(date, timeZone) {
  const parts = partsIn(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localHour(date, timeZone) {
  return Number(partsIn(date, timeZone).hour);
}

/** "Thursday 2026-10-29, 14:05", for the agent's prompt. */
function describeNow(date, timeZone) {
  const parts = partsIn(date, timeZone);
  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day}, ${parts.hour}:${parts.minute}`;
}

/** How far `timeZone` is ahead of UTC at `date`, in milliseconds. */
function offsetMs(date, timeZone) {
  const parts = partsIn(date, timeZone);
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant when the wall clock in `timeZone` reads `dateString` at `hour:minute`. */
function zonedToUtc(dateString, hour, minute, timeZone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Correct twice, so a guess on the other side of a DST change still lands right.
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another ("2026-11-02" to "2026-11-05" is 3). */
function daysBetween(from, to) {
  const utc = (dateString) => {
    const [year, month, day] = dateString.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

/** The Monday on or before `dateString`. */
function startOfWeek(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(dateString, -((weekday + 6) % 7));
}

function isValidDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value) && addDays(value, 0) === value;
}

/** Checks a "YYYY-MM-DD" argument, or throws a message the model or user can fix. */
function parseDate(value, field) {
  if (!isValidDate(value)) {
    throw new ValidationError(`${field} must be a date like 2026-11-05 (got "${value}").`);
  }
  return value;
}

/**
 * Reads a local "YYYY-MM-DD" (at `defaultHour`) or "YYYY-MM-DDTHH:mm" and
 * returns the UTC instant.
 */
function parseLocalDateTime(value, { timeZone, defaultHour, field }) {
  if (isValidDate(value)) return zonedToUtc(value, defaultHour, 0, timeZone);

  const match = typeof value === "string" ? value.match(DATE_TIME_PATTERN) : null;
  if (match && isValidDate(match[1]) && +match[2] < 24 && +match[3] < 60) {
    return zonedToUtc(match[1], +match[2], +match[3], timeZone);
  }
  throw new ValidationError(`${field} must look like 2026-11-05 or 2026-11-05T14:30 (got "${value}").`);
}

/** "Thu, Nov 5, 09:00" in the user's timezone. */
function formatLocal(instant, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

/** True when two timezones show the same wall-clock time at `date` ("America/Toronto" and "America/New_York" do). */
function sameOffset(date, zoneA, zoneB) {
  return offsetMs(date, zoneA) === offsetMs(date, zoneB);
}

module.exports = {
  sameOffset,
  localDate,
  localHour,
  describeNow,
  zonedToUtc,
  addDays,
  daysBetween,
  startOfWeek,
  isValidDate,
  parseDate,
  parseLocalDateTime,
  formatLocal,
};
