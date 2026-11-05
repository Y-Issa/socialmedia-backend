// Small validation helpers shared by routes and controllers.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST_MAX_LENGTH = 2000;
export const COMMENT_MAX_LENGTH = 1000;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value);
}

// Trims a string; anything that isn't a string becomes "".
export function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Trims a string and returns null when it ends up empty.
export function optionalString(value) {
  const cleaned = cleanString(value);
  return cleaned === "" ? null : cleaned;
}

// Express router.param handler: rejects ids that aren't UUIDs with 400.
export function validateIdParam(req, res, next, value) {
  if (!isUuid(value)) {
    return res.status(400).send("Invalid id");
  }
  next();
}

// Validates a post body. Returns an error message or null.
export function postError(description, image) {
  if (!description && !image) {
    return "Post can't be empty";
  }
  if (description && description.length > POST_MAX_LENGTH) {
    return `Post is too long (max ${POST_MAX_LENGTH} characters)`;
  }
  if (image && image.length > 200) {
    return "Invalid image";
  }
  return null;
}

// Validates a comment body. Returns an error message or null.
export function commentError(description) {
  if (!description) {
    return "Comment can't be empty";
  }
  if (description.length > COMMENT_MAX_LENGTH) {
    return `Comment is too long (max ${COMMENT_MAX_LENGTH} characters)`;
  }
  return null;
}

// Postgres foreign key violation (e.g. liking a post that doesn't exist).
export function isForeignKeyViolation(error) {
  return error && error.code === "23503";
}
