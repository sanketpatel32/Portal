import { safeGetItem, safeRemoveItem, safeSetItem } from "./safe-storage";

/** Shared external MongoDB URI for the NoSQL Client only. */
const LEGACY_STORAGE_KEY = "nosql-mongodb-uri";
const EXTERNAL_MONGODB_URI_KEY = "external-mongodb-uri";

export function getStoredMongoUri(): string {
  const current = safeGetItem(EXTERNAL_MONGODB_URI_KEY);
  if (current) return current;

  const legacy = safeGetItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    safeSetItem(EXTERNAL_MONGODB_URI_KEY, legacy);
    safeRemoveItem(LEGACY_STORAGE_KEY);
    return legacy;
  }

  return "";
}

export function setStoredMongoUri(uri: string): void {
  const trimmed = uri.trim();
  if (trimmed) {
    safeSetItem(EXTERNAL_MONGODB_URI_KEY, trimmed);
    safeRemoveItem(LEGACY_STORAGE_KEY);
    return;
  }
  clearStoredMongoUri();
}

export function clearStoredMongoUri(): void {
  safeRemoveItem(EXTERNAL_MONGODB_URI_KEY);
  safeRemoveItem(LEGACY_STORAGE_KEY);
}

export function hasStoredMongoUri(): boolean {
  return Boolean(getStoredMongoUri());
}
