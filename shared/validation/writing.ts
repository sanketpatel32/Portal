import { z } from "zod";

export const writingModeSchema = z.enum(["grammar", "improve", "linkedin", "twitter"]);
export const writingToneSchema = z.enum([
  "neutral",
  "concise",
  "business",
  "formal",
  "casual",
  "persuasive",
  "friendly",
  "academic",
]);

export const improveWritingRequestSchema = z.object({
  input: z.string().trim().min(1, "Paste something to improve first.").max(12_000, "Input is too long (max 12,000 characters)"),
  mode: writingModeSchema.default("grammar"),
  tone: writingToneSchema.default("neutral"),
  instruction: z.string().max(500, "Instruction is too long").optional(),
});

export type WritingMode = z.infer<typeof writingModeSchema>;
export type WritingTone = z.infer<typeof writingToneSchema>;
export type ImproveWritingRequest = z.infer<typeof improveWritingRequestSchema>;
