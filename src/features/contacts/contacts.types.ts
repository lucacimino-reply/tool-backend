export type ContactSubmissionInput = {
  name: string;
  email: string;
};

export type ValidationError = {
  errors: Partial<Record<keyof ContactSubmissionInput, string>>;
};

export type ServerError = {
  message: string;
};

export type SubmissionRepository = {
  create(input: ContactSubmissionInput): Promise<void>;
};
