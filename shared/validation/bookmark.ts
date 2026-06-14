import { z } from "zod";
import { sanitizeString } from "./common";

export const bookmarkUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL is too long")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must start with http:// or https://" },
  );

/**
 * Canonical tag options surfaced in the UI dropdown. A free-form fallback is
 * still allowed server-side (so existing data never breaks), but the picker
 * steers users toward this curated set.
 */
export const BOOKMARK_TAGS = [
  "Reading",
  "Tools",
  "Reference",
  "Design",
  "Code",
  "Learning",
  "Inspiration",
  "Social",
  "Media",
  "Other",
] as const;

export const bookmarkTagSchema = z
  .string()
  .trim()
  .min(1, "Tag cannot be empty")
  .max(40, "Tag is too long")
  .transform(sanitizeString);

export const createBookmarkSchema = z.object({
  url: bookmarkUrlSchema,
  title: z
    .string()
    .trim()
    .max(200, "Title is too long")
    .optional()
    .transform((value) => (value ? sanitizeString(value) : undefined)),
  tag: bookmarkTagSchema.default("Reading"),
  favorite: z.boolean().default(false),
});

export const updateBookmarkSchema = z.object({
  url: bookmarkUrlSchema.optional(),
  title: z
    .string()
    .trim()
    .max(200, "Title is too long")
    .optional()
    .transform((value) => (value ? sanitizeString(value) : undefined)),
  tag: bookmarkTagSchema.optional(),
  favorite: z.boolean().optional(),
});

export const bookmarkListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  favorite: z.preprocess((value) => value === "true" || value === true, z.boolean().default(false)),
});

export const fetchTitleSchema = z.object({
  url: bookmarkUrlSchema,
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
export type BookmarkListQuery = z.infer<typeof bookmarkListQuerySchema>;
