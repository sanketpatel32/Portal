/** Shared external MongoDB URI for the NoSQL Client only. */
const LEGACY_STORAGE_KEY = "nosql-mongodb-uri";
const EXTERNAL_MONGODB_URI_KEY = "external-mongodb-uri";

export function getStoredMongoUri(): string {
  const current = localStorage.getItem(EXTERNAL_MONGODB_URI_KEY);
  if (current) return current;

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    localStorage.setItem(EXTERNAL_MONGODB_URI_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacy;
  }

  return "";
}

export function setStoredMongoUri(uri: string): void {
  const trimmed = uri.trim();
  if (trimmed) {
    localStorage.setItem(EXTERNAL_MONGODB_URI_KEY, trimmed);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  clearStoredMongoUri();
}

export function clearStoredMongoUri(): void {
  localStorage.removeItem(EXTERNAL_MONGODB_URI_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function hasStoredMongoUri(): boolean {
  return Boolean(getStoredMongoUri());
}
