import validator from "validator";

import type { ContactSubmission, ValidationErrorResponse } from "./contact-submissions.types.js";

type ValidationResult =
  | { data: ContactSubmission; valid: true }
  | { errors: ValidationErrorResponse; valid: false };

function characterCount(value: string): number {
  return Array.from(value).length;
}

export function validateContactSubmission(input: unknown): ValidationResult {
  const errors: ValidationErrorResponse["errors"] = {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { errors: { errors }, valid: false };
  }

  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "name" && key !== "email")) {
    return { errors: { errors }, valid: false };
  }

  const { email, name } = body;
  if (typeof name !== "string") {
    errors.name = "Name is required and must be a string.";
  } else if (characterCount(name) < 1 || characterCount(name) > 100) {
    errors.name = "Name must contain between 1 and 100 characters.";
  }

  if (typeof email !== "string") {
    errors.email = "Email is required and must be a string.";
  } else if (characterCount(email) > 254 || !validator.isEmail(email, { allow_utf8_local_part: true })) {
    errors.email = "Email must be a valid email address with at most 254 characters.";
  }

  if (typeof name !== "string" || typeof email !== "string" || Object.keys(errors).length > 0) {
    return { errors: { errors }, valid: false };
  }

  return { data: { email, name }, valid: true };
}
