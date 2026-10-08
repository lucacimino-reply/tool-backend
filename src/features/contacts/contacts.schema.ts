import { z } from "zod";

export const submissionSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .min(1, "Name is required.")
    .refine((value) => Array.from(value).length <= 100, "Name must be at most 100 characters."),
  email: z
    .string({ required_error: "Email is required." })
    .email("Enter a valid email address.")
    .refine((value) => Array.from(value).length <= 254, "Email must be at most 254 characters."),
});
