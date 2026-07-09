import { safeGetItem, safeRemoveItem, safeSetItem } from "./safe-storage";

const EXTERNAL_SQL_CONNECTION_KEY = "external-sql-connection-string";

export function getStoredSqlConnection(): string {
  return safeGetItem(EXTERNAL_SQL_CONNECTION_KEY) ?? "";
}

export function setStoredSqlConnection(connectionString: string): void {
  const trimmed = connectionString.trim();
  if (trimmed) {
    safeSetItem(EXTERNAL_SQL_CONNECTION_KEY, trimmed);
    return;
  }
  clearStoredSqlConnection();
}

export function clearStoredSqlConnection(): void {
  safeRemoveItem(EXTERNAL_SQL_CONNECTION_KEY);
}

export function hasStoredSqlConnection(): boolean {
  return Boolean(getStoredSqlConnection());
}
