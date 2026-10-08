export type NewSubmission = {
  name: string;
  email: string;
};

export type StoredSubmission = NewSubmission & {
  id: string;
  submittedAt: Date;
};

export type ValidationFields = Partial<Record<keyof NewSubmission, string>>;

export type SubmissionResult =
  | { kind: "accepted"; submission: NewSubmission }
  | { kind: "invalid"; fields: ValidationFields }
  | { kind: "capacity" };

export interface SubmissionRepository {
  createWithinCapacity(submission: NewSubmission): Promise<StoredSubmission | null>;
}
