/**
 * Errors with a message that is safe to show. The REST error handler turns
 * them into 400/401/403/404 responses; agent tools pass the message back to the model.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

class UnauthorizedError extends Error {
  constructor(message = "Sign in first.") {
    super(message);
    this.name = "UnauthorizedError";
    this.status = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
    this.status = 403;
  }
}

module.exports = { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError };
