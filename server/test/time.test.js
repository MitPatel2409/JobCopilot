const test = require("node:test");
const assert = require("node:assert/strict");
const { zonedToUtc, addDays, localDate, isValidDate, parseLocalDateTime } = require("../utils/time");

const TZ = "America/Toronto";

test("zonedToUtc handles both sides of a DST change", () => {
  // EDT (UTC-4) before Nov 1 2026, EST (UTC-5) after.
  assert.equal(zonedToUtc("2026-10-30", 9, 0, TZ).toISOString(), "2026-10-30T13:00:00.000Z");
  assert.equal(zonedToUtc("2026-11-05", 9, 0, TZ).toISOString(), "2026-11-05T14:00:00.000Z");
});

test("localDate uses the user's timezone, not UTC", () => {
  // 02:00 UTC on Oct 30 is still the evening of Oct 29 in Toronto.
  assert.equal(localDate(new Date("2026-10-30T02:00:00Z"), TZ), "2026-10-29");
});

test("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-10-29", 7), "2026-11-05");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("isValidDate rejects impossible dates", () => {
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("2026-2-3"), false);
  assert.equal(isValidDate("2026-11-05"), true);
});

test("parseLocalDateTime reads a date (at the default hour) or a date-time", () => {
  const options = { timeZone: TZ, defaultHour: 9, field: "due" };
  assert.equal(parseLocalDateTime("2026-11-06", options).toISOString(), "2026-11-06T14:00:00.000Z");
  assert.equal(parseLocalDateTime("2026-11-06T17:30", options).toISOString(), "2026-11-06T22:30:00.000Z");
  assert.throws(() => parseLocalDateTime("next friday", options), /due must look like/);
});
