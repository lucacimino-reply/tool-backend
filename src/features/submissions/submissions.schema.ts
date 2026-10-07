import { z } from "zod";

function hasCharacterCountBetween(value: string, minimum: number, maximum: number): boolean {
  const length = Array.from(value).length;
  return length >= minimum && length <= maximum;
}

export const submissionBodySchema = z.object({
  name: z.string().refine((value) => hasCharacterCountBetween(value, 1, 100)),
  email: z
    .string()
    .email()
    .refine((value) => hasCharacterCountBetween(value, 1, 254)),
});

export type SubmissionBody = z.infer<typeof submissionBodySchema>;
