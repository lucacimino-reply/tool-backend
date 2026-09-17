import type { Request, Response } from 'express';
import type { Pool } from 'pg';

import { validateLogin, validateSignUp } from './auth.schema.js';
import { DuplicateEmailError, getSession, logIn, signUp } from './auth.service.js';
import type { ValidationProblem } from './auth.types.js';

type AuthOptions = { sessionDurationHours: number; secureCookies: boolean };

function sendValidation(response: Response, problem: ValidationProblem): void {
  response.status(422).json(problem);
}

function setSessionCookie(response: Response, token: string, secure: boolean): void {
  response.cookie('clean_session', token, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

export function createAuthController(pool: Pool, options: AuthOptions) {
  return {
    signUp: async (request: Request, response: Response): Promise<void> => {
      const input = validateSignUp(request.body);
      if ('code' in input) return sendValidation(response, input);
      try {
        const result = await signUp(pool, input, options.sessionDurationHours);
        setSessionCookie(response, result.token, options.secureCookies);
        response.status(201).json(result.authenticated);
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          response.status(409).json({
            code: 'duplicate_email',
            message: 'An account already exists for this email address.',
            fieldErrors: { email: 'An account already exists for this email address.' },
          });
          return;
        }
        throw error;
      }
    },
    logIn: async (request: Request, response: Response): Promise<void> => {
      const input = validateLogin(request.body);
      if ('code' in input) return sendValidation(response, input);
      const result = await logIn(pool, input, options.sessionDurationHours);
      if (!result) {
        response.status(401).json({ code: 'incorrect_credentials', message: 'The email or password you entered is incorrect.' });
        return;
      }
      setSessionCookie(response, result.token, options.secureCookies);
      response.status(200).json(result.authenticated);
    },
    getSession: async (request: Request, response: Response): Promise<void> => {
      const authenticated = await getSession(pool, request.cookies.clean_session as string | undefined);
      if (!authenticated) {
        response.status(401).json({ code: 'unauthenticated', message: 'Authentication is required.' });
        return;
      }
      response.status(200).json(authenticated);
    },
  };
}
