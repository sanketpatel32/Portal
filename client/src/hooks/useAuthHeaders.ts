import { useMemo } from "react";

export function useAuthHeaders(token: string, additionalHeaders?: Record<string, string>) {
  return useMemo(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }
    return headers;
  }, [token, additionalHeaders]);
}
