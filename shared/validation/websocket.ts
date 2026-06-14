import { z } from "zod";
import { sanitizeString } from "./common";

export const chatMessageSchema = z.object({
  type: z.literal("chat"),
  sender: z.string().min(1).max(30).transform(sanitizeString),
  message: z.string().min(1).max(200).transform(sanitizeString),
});

export const websocketPingSchema = z.object({
  type: z.literal("ping"),
});
