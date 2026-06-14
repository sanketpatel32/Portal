import { z } from "zod";

export const verifyPinSchema = z.object({
  pin: z.string().min(1, "PIN is required").max(32, "PIN is too long"),
});
