import type { SubmissionRepository } from "./contacts.types.js";

export const EXPIRY_CLEANUP_INTERVAL_MS = 60 * 1000;

type ExpiryScheduler = (callback: () => Promise<void>, intervalMs: number) => () => void;

function scheduleInterval(callback: () => Promise<void>, intervalMs: number): () => void {
  const timer = setInterval(() => {
    void callback();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export async function startSubmissionExpiryCleanup(
  repository: Pick<SubmissionRepository, "deleteExpired">,
  schedule: ExpiryScheduler = scheduleInterval,
  onError: (error: unknown) => void = (error) => console.error("Expired submission cleanup failed", error),
): Promise<() => void> {
  await repository.deleteExpired();

  let cleanupInProgress = false;
  return schedule(async () => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;
    try {
      await repository.deleteExpired();
    } catch (error) {
      onError(error);
    } finally {
      cleanupInProgress = false;
    }
  }, EXPIRY_CLEANUP_INTERVAL_MS);
}
