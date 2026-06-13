const EXTERNAL_SQL_CONNECTION_KEY = "external-sql-connection-string";

export function getStoredSqlConnection(): string {
  return localStorage.getItem(EXTERNAL_SQL_CONNECTION_KEY) ?? "";
}

export function setStoredSqlConnection(connectionString: string): void {
  const trimmed = connectionString.trim();
  if (trimmed) {
    localStorage.setItem(EXTERNAL_SQL_CONNECTION_KEY, trimmed);
    return;
  }
  clearStoredSqlConnection();
}

export function clearStoredSqlConnection(): void {
  localStorage.removeItem(EXTERNAL_SQL_CONNECTION_KEY);
}

export function hasStoredSqlConnection(): boolean {
  return Boolean(getStoredSqlConnection());
}
