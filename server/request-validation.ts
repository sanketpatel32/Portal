import type { ZodType } from "zod";
import { validationFailedResponse } from "./routes/helpers";

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const body = await readJsonBody(req);
  const validated = schema.safeParse(body ?? {});
  if (!validated.success) {
    return { ok: false, response: validationFailedResponse(req, validated.error) };
  }
  return { ok: true, data: validated.data };
}

export function parseQueryParams<T>(
  req: Request,
  schema: ZodType<T>,
): { ok: true; data: T } | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const validated = schema.safeParse(params);
  if (!validated.success) {
    return { ok: false, response: validationFailedResponse(req, validated.error) };
  }
  return { ok: true, data: validated.data };
}
