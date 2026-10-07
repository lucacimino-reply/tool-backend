import type { SubmissionInput, SubmissionStore } from "./submissions.types.js";

export async function submitContact(store: SubmissionStore, input: SubmissionInput) {
  return store.createWithinCapacity(input);
}
