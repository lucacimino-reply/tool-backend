import validator from "validator";

import type { ContactSubmissionInput, ValidationError } from "./contacts.types.js";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

export function validateSubmission(value: unknown): ValidationError | ContactSubmissionInput {
  const errors: ValidationError["errors"] = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: { name: "Name is required.", email: "Email is required." } };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "name" && key !== "email")) {
    errors.name = "Only name and email are allowed.";
  }
  if (typeof record.name !== "string" || record.name.length < 1 || record.name.length > MAX_NAME_LENGTH) {
    errors.name = "Name must be a string between 1 and 100 characters.";
  }
  if (
    typeof record.email !== "string" ||
    record.email.length > MAX_EMAIL_LENGTH ||
    !validator.isEmail(record.email)
  ) {
    errors.email = "Email must be a valid email address of at most 254 characters.";
  }

  return Object.keys(errors).length > 0
    ? { errors }
    : { name: record.name as string, email: record.email as string };
}

export function isValidationError(value: ValidationError | ContactSubmissionInput): value is ValidationError {
  return "errors" in value;
}
