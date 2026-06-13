import crypto from "crypto";
import mongoose from "mongoose";
import { env, isGoogleCalendarConfigured } from "./env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStates = new Map<string, number>();

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: string;
  end: string;
  allDay: boolean;
};

interface IGoogleTokenDocument extends mongoose.Document {
  singletonKey: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const googleTokenSchema = new mongoose.Schema<IGoogleTokenDocument>(
  {
    singletonKey: { type: String, required: true, unique: true, default: "default" },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    email: { type: String },
  },
  { timestamps: true }
);

const GoogleTokenModel = mongoose.model<IGoogleTokenDocument>("GoogleToken", googleTokenSchema);

export function googleCalendarConfigured(): boolean {
  return isGoogleCalendarConfigured();
}

function pruneExpiredOAuthStates() {
  const now = Date.now();
  for (const [state, createdAt] of oauthStates.entries()) {
    if (now - createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}

export function createOAuthState(): string {
  pruneExpiredOAuthStates();
  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.set(state, Date.now());
  return state;
}

export function consumeOAuthState(state: string): boolean {
  pruneExpiredOAuthStates();
  const createdAt = oauthStates.get(state);
  if (!createdAt) return false;
  oauthStates.delete(state);
  return Date.now() - createdAt <= OAUTH_STATE_TTL_MS;
}

function getGoogleRedirectUri(): string {
  const base = env.SERVER_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/api/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

async function postGoogleTokenRequest(body: URLSearchParams, errorLabel: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || errorLabel);
  }
  return data as TokenResponse;
}

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return postGoogleTokenRequest(
    new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
    "Token exchange failed"
  );
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postGoogleTokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    "Token refresh failed"
  );
}

async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { email?: string };
  return data.email;
}

export async function saveGoogleTokensFromCode(code: string): Promise<{ email?: string }> {
  const tokens = await exchangeCodeForTokens(code);
  const existing = await GoogleTokenModel.findOne({ singletonKey: "default" });
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Disconnect and connect again.");
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const email = await fetchGoogleEmail(tokens.access_token);

  await GoogleTokenModel.findOneAndUpdate(
    { singletonKey: "default" },
    {
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt,
      email,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { email };
}

async function getValidAccessToken(): Promise<string | null> {
  const record = await GoogleTokenModel.findOne({ singletonKey: "default" });
  if (!record) return null;

  const bufferMs = 60_000;
  if (record.expiresAt.getTime() - bufferMs > Date.now()) {
    return record.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(record.refreshToken);
    record.accessToken = refreshed.access_token;
    record.expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await record.save();
    return record.accessToken;
  } catch {
    await GoogleTokenModel.deleteOne({ singletonKey: "default" });
    return null;
  }
}

export async function getGoogleCalendarStatus(): Promise<{ connected: boolean; email?: string }> {
  const record = await GoogleTokenModel.findOne({ singletonKey: "default" });
  if (!record) {
    return { connected: false };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { connected: false };
  }

  return { connected: true, email: record.email };
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await GoogleTokenModel.deleteOne({ singletonKey: "default" });
}

function parseEventDate(value?: { date?: string; dateTime?: string }): { iso: string; allDay: boolean } {
  if (value?.dateTime) {
    return { iso: value.dateTime, allDay: false };
  }
  if (value?.date) {
    return { iso: `${value.date}T00:00:00`, allDay: true };
  }
  return { iso: new Date().toISOString(), allDay: false };
}

export async function listGoogleCalendarEvents(days = 7): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("Google Calendar is not connected");
  }

  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + Math.min(Math.max(days, 1), 30));

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(`${GOOGLE_EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to fetch calendar events");
  }

  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item: Record<string, unknown>) => {
    const start = parseEventDate(item.start as { date?: string; dateTime?: string });
    const end = parseEventDate(item.end as { date?: string; dateTime?: string });
    return {
      id: String(item.id ?? crypto.randomUUID()),
      summary: String(item.summary ?? "Untitled event"),
      description: typeof item.description === "string" ? item.description : undefined,
      location: typeof item.location === "string" ? item.location : undefined,
      htmlLink: typeof item.htmlLink === "string" ? item.htmlLink : undefined,
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
    };
  });
}

function formatGoogleDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTodoEventBody(input: { title: string; deadline: Date; allDay: boolean }) {
  const end = new Date(input.deadline);
  if (input.allDay) {
    const nextDay = new Date(end);
    nextDay.setDate(nextDay.getDate() + 1);
    return {
      summary: `[Todo] ${input.title}`,
      description: "Created from AuraFlow Clock todo list",
      start: { date: formatGoogleDate(end) },
      end: { date: formatGoogleDate(nextDay) },
    };
  }

  const start = new Date(input.deadline);
  start.setMinutes(start.getMinutes() - 30);
  return {
    summary: `[Todo] ${input.title}`,
    description: "Created from AuraFlow Clock todo list",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

async function mutateGoogleCalendarEvent(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
  errorLabel: string
): Promise<{ id?: string }> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return {};

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || errorLabel);
  }
  return typeof data.id === "string" ? { id: data.id } : {};
}

export async function createGoogleCalendarEventForTodo(input: {
  title: string;
  deadline: Date;
  allDay: boolean;
}): Promise<string | undefined> {
  const result = await mutateGoogleCalendarEvent(
    "POST",
    GOOGLE_EVENTS_URL,
    buildTodoEventBody(input),
    "Failed to create calendar event"
  );
  return result.id;
}

export async function updateGoogleCalendarEventForTodo(
  eventId: string,
  input: { title: string; deadline: Date; allDay: boolean }
): Promise<void> {
  await mutateGoogleCalendarEvent(
    "PATCH",
    `${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`,
    buildTodoEventBody(input),
    "Failed to update calendar event"
  );
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return;

  const res = await fetch(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "Failed to delete calendar event");
  }
}
