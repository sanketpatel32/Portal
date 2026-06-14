import type { AppOneSubappId } from "../types/app";

const VALID_SUBAPP_IDS = new Set<AppOneSubappId>([
  "github-issue-analyser",
  "expense-tracker",
  "nosql-client",
  "subapp4",
  "postman",
  "writing-agent",
  "subapp8",
  "subapp9",
  "subapp10",
]);

export type AppNavigation = {
  activeApp: number | null;
  activeSubapp: AppOneSubappId | null;
};

function isValidSubappId(value: string): value is AppOneSubappId {
  return VALID_SUBAPP_IDS.has(value as AppOneSubappId);
}

export function parseNavigationFromHash(hash: string): AppNavigation {
  const path = hash.replace(/^#/, "").replace(/^\//, "");
  if (!path) {
    return { activeApp: null, activeSubapp: null };
  }

  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "app") {
    return { activeApp: null, activeSubapp: null };
  }

  const appNum = Number(parts[1]);
  if (!Number.isInteger(appNum) || appNum < 1) {
    return { activeApp: null, activeSubapp: null };
  }

  const subappId = parts[2];
  if (subappId && isValidSubappId(subappId)) {
    return { activeApp: appNum, activeSubapp: subappId };
  }

  return { activeApp: appNum, activeSubapp: null };
}

export function navigationToHash(
  activeApp: number | null,
  activeSubapp: AppOneSubappId | null,
): string {
  if (activeApp === null) {
    return "";
  }
  if (activeSubapp) {
    return `#/app/${activeApp}/${activeSubapp}`;
  }
  return `#/app/${activeApp}`;
}

export function updateNavigationHash(
  activeApp: number | null,
  activeSubapp: AppOneSubappId | null,
  replace = false,
): void {
  const next = navigationToHash(activeApp, activeSubapp);
  if (window.location.hash === next) {
    return;
  }

  const url = `${window.location.pathname}${window.location.search}${next}`;
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}

export function clearNavigationHash(): void {
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", url);
}

export function readInitialNavigation(): AppNavigation {
  return parseNavigationFromHash(window.location.hash);
}
