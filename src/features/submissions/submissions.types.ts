export type SubmissionInput = {
  name: string;
  email: string;
};

export type Submission = SubmissionInput & {
  id: string;
  createdAt: Date;
};

export type SubmissionSuccessBody = {
  submission: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
};

export type SubmissionValidationErrorBody = {
  error: {
    code: "VALIDATION_FAILED";
    fields: Record<string, string>;
  };
};

export type SubmissionErrorBody = {
  error: {
    code: "CAPACITY_EXCEEDED" | "SUBMISSION_FAILED";
  };
};

export interface SubmissionStore {
  createWithinCapacity(input: SubmissionInput): Promise<Submission | null>;
}
