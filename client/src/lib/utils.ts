import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a unique id string.
 *
 * `crypto.randomUUID()` is only available in secure contexts (HTTPS or
 * localhost). On plain-HTTP deploys it is undefined, which throws
 * "crypto.randomUUID is not a function". This helper falls back to
 * `crypto.getRandomValues` (available everywhere) and finally to
 * `Math.random` so id generation never throws, regardless of context.
 */
export function createId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    // RFC4122 v4 layout from 16 random bytes.
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h = (n: number) => n.toString(16).padStart(2, "0");
    return `${h(b[0])}${h(b[1])}${h(b[2])}${h(b[3])}-${h(b[4])}${h(b[5])}-${h(b[6])}${h(b[7])}-${h(b[8])}${h(b[9])}-${h(b[10])}${h(b[11])}${h(b[12])}${h(b[13])}${h(b[14])}${h(b[15])}`;
  }

  // Last-resort fallback (non-crypto). Collision odds are negligible for
  // ephemeral client-side row ids.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
