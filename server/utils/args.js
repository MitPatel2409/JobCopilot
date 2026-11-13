/**
 * Checks the arguments a model sends to a tool, or a request body. A bad
 * argument throws a ValidationError: the model reads it and retries, and the
 * REST error handler turns it into a 400.
 */
const { ValidationError } = require("./errors");
const { parseDate, parseLocalDateTime } = require("./time");

function isBlank(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function text(args, field, { required = false, max = 4000 } = {}) {
  const value = args[field];
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  return value.trim().slice(0, max);
}

function id(args, field, { required = false } = {}) {
  const value = args[field];
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ValidationError(`${field} must be a positive whole number.`);
  return number;
}

/** A web address; "linkedin.com/in/x" gets "https://" added. */
function url(args, field) {
  const value = text(args, field, { max: 1000 });
  if (value === undefined) return undefined;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".")) throw new Error();
    return parsed.toString();
  } catch {
    throw new ValidationError(`${field} must be a web address (got "${value}").`);
  }
}

function email(args, field) {
  const value = text(args, field, { max: 320 });
  if (value === undefined) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ValidationError(`${field} must be an email address (got "${value}").`);
  return value.toLowerCase();
}

function date(args, field, { required = false } = {}) {
  const value = text(args, field);
  if (value === undefined) {
    if (required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  return parseDate(value, field);
}

/** A local date or date-time, returned as a Date (UTC instant). */
function dateTime(ctx, args, field, { required = false } = {}) {
  const value = text(args, field);
  if (value === undefined) {
    if (required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  return parseLocalDateTime(value, { timeZone: ctx.config.timezone, defaultHour: ctx.config.reminderHour, field });
}

function oneOf(args, field, choices, { required = false } = {}) {
  const value = text(args, field);
  if (value === undefined) {
    if (required) throw new ValidationError(`${field} is required.`);
    return undefined;
  }
  if (!choices.includes(value)) throw new ValidationError(`${field} must be one of: ${choices.join(", ")}.`);
  return value;
}

function flag(args, field) {
  return args[field] === true || args[field] === "true";
}

module.exports = { text, id, url, email, date, dateTime, oneOf, flag };
