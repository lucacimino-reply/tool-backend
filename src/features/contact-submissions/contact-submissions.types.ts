export type ContactSubmission = {
  email: string;
  name: string;
};

export type ValidationErrorResponse = {
  errors: Partial<Record<keyof ContactSubmission, string>>;
};

export type SubmissionErrorResponse = {
  message: string;
};
