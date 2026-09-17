import { z } from 'zod';

import type { LoginInput, SignUpInput, ValidationProblem } from './auth.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signUpSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  termsAccepted: z.boolean(),
}).strict();

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
}).strict();

function validateText(value: string, field: 'name' | 'email', maximum: number): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${field === 'name' ? 'Name' : 'Email'} is required.`;
  if (trimmed.length > maximum) return `${field === 'name' ? 'Name' : 'Email'} must be at most ${maximum} characters.`;
  if (field === 'email' && !EMAIL_PATTERN.test(trimmed)) return 'Email must be a valid email address.';
  return undefined;
}

function validationProblem(fieldErrors: Record<string, string>): ValidationProblem {
  return { code: 'validation_error', message: 'One or more fields are invalid.', fieldErrors };
}

function isValidationProblem(value: Record<string, unknown> | ValidationProblem): value is ValidationProblem {
  return 'code' in value;
}

function parseObject(schema: typeof signUpSchema | typeof loginSchema, input: unknown): Record<string, unknown> | ValidationProblem {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && field !== 'unrecognized_keys') fieldErrors[field] = 'This field is required and must have the correct type.';
  }
  if (Object.keys(fieldErrors).length === 0) fieldErrors.body = 'Request body must contain only supported fields.';
  return validationProblem(fieldErrors);
}

export function validateSignUp(input: unknown): SignUpInput | ValidationProblem {
  const parsed = parseObject(signUpSchema, input);
  if (isValidationProblem(parsed)) return parsed;
  const name = parsed.name as string;
  const email = parsed.email as string;
  const password = parsed.password as string;
  const termsAccepted = parsed.termsAccepted as boolean;
  const fieldErrors: Record<string, string> = {};
  const nameError = validateText(name, 'name', 100);
  const emailError = validateText(email, 'email', 254);
  if (nameError) fieldErrors.name = nameError;
  if (emailError) fieldErrors.email = emailError;
  if (password.length < 8 || password.length > 64) fieldErrors.password = 'Password must be between 8 and 64 characters.';
  if (!termsAccepted) fieldErrors.termsAccepted = 'You must accept the terms to continue.';
  return Object.keys(fieldErrors).length ? validationProblem(fieldErrors) : { name: name.trim(), email: email.trim(), password, termsAccepted };
}

export function validateLogin(input: unknown): LoginInput | ValidationProblem {
  const parsed = parseObject(loginSchema, input);
  if (isValidationProblem(parsed)) return parsed;
  const email = parsed.email as string;
  const password = parsed.password as string;
  const fieldErrors: Record<string, string> = {};
  const emailError = validateText(email, 'email', 254);
  if (emailError) fieldErrors.email = emailError;
  if (password.length < 8 || password.length > 64) fieldErrors.password = 'Password must be between 8 and 64 characters.';
  return Object.keys(fieldErrors).length ? validationProblem(fieldErrors) : { email: email.trim(), password };
}
