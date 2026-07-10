import type { AppOneSubappId } from "../types/app";

const VALID_SUBAPP_IDS = new Set<AppOneSubappId>([
	"github-issue-analyser",
	"expense-tracker",
	"nosql-client",
	"subapp4",
	"postman",
	"writing-agent",
	"subapp8",
	"cron-scheduler",
	"clock-calendar",
	"bookmark-manager",
	"picker-wheel",
	"json-toolkit",
	"generator-tools",
	"text-tools",
	"color-tools",
	"time-tools",
	"markdown-previewer",
	"http-status",
]);

// Legacy app numbers (pre-portal-grid) → their new subapp tile. Time & Cal used
// to be app 2, Bookmark was app 3. Old bookmarked URLs are redirected so they
// don't land on a blank screen.
const LEGACY_APP_TO_SUBAPP: Record<number, AppOneSubappId> = {
	2: "clock-calendar",
	3: "bookmark-manager",
};

export type AppNavigation = {
	activeApp: number | null;
	activeSubapp: AppOneSubappId | null;
};

function isValidSubappId(value: string): value is AppOneSubappId {
	return VALID_SUBAPP_IDS.has(value as AppOneSubappId);
}

export function parseNavigationFromPath(pathname: string): AppNavigation {
	const path = pathname.replace(/^\//, "");
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

	// Legacy /app/2 or /app/3 (no subapp segment) → redirect to the new tile.
	if (LEGACY_APP_TO_SUBAPP[appNum]) {
		return { activeApp: 1, activeSubapp: LEGACY_APP_TO_SUBAPP[appNum] };
	}

	return { activeApp: appNum, activeSubapp: null };
}

export function navigationToPath(
	activeApp: number | null,
	activeSubapp: AppOneSubappId | null,
): string {
	if (activeApp === null) {
		return "/";
	}
	if (activeSubapp) {
		return `/app/${activeApp}/${activeSubapp}`;
	}
	return `/app/${activeApp}`;
}

export function updateNavigationPath(
	activeApp: number | null,
	activeSubapp: AppOneSubappId | null,
	replace = false,
): void {
	const next = navigationToPath(activeApp, activeSubapp);
	if (window.location.pathname === next) {
		return;
	}

	const url = `${next}${window.location.search}`;
	if (replace) {
		window.history.replaceState(null, "", url);
	} else {
		window.history.pushState(null, "", url);
	}
}

export function clearNavigationPath(): void {
	const url = `${window.location.origin}/${window.location.search}`;
	window.history.replaceState(null, "", url);
}

export function readInitialNavigation(): AppNavigation {
	return parseNavigationFromPath(window.location.pathname);
}
