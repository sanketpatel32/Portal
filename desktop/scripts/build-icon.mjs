#!/usr/bin/env node
// Regenerate the Windows .ico (multi-frame PNG-based) and a 512px .png from
// desktop/resources/icon.svg. Requires `sharp` — install with:
//   npm i -g sharp   (or run inside desktop/node_modules if added there)
//
// Usage: node desktop/scripts/build-icon.mjs
//
// Re-run whenever icon.svg changes. The .ico embeds 256/128/64/48/32/16 frames
// so Windows can pick the best size for taskbar, Alt+Tab, Start, and .exe icon.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Try a local sharp first, then fall back to any resolvable one.
let sharp;
try {
	// Local install (preferred once desktop depends on it).
	sharp = require("sharp");
} catch {
	// Fall back to a globally-installed sharp. createRequire resolves modules
	// relative to the anchor file, so we anchor inside a global package that
	// has sharp in its node_modules. We probe a few well-known locations.
	const globalRoot = join(process.env.APPDATA ?? "", "npm", "node_modules");
	const candidates = [
		join(globalRoot, "@gitlawb", "openclaude", "package.json"),
		join(globalRoot, "sharp", "package.json"),
	];
	let resolved = null;
	for (const anchor of candidates) {
		try {
			resolved = createRequire(anchor)("sharp");
			break;
		} catch {
			// try next
		}
	}
	if (!resolved) {
		throw new Error(
			"sharp not found. Install it locally (bun add -d sharp in desktop/) or globally (npm i -g sharp).",
		);
	}
	sharp = resolved;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const resDir = join(__dirname, "..", "resources");
const svgPath = join(resDir, "icon.svg");

const svg = await readFile(svgPath, "utf8");

// Largest first is conventional; 256 is stored as width byte 0 per the ICO spec.
const sizes = [256, 128, 64, 48, 32, 16];
const pngs = [];
for (const s of sizes) {
	pngs.push(await sharp(Buffer.from(svg)).resize(s, s).png().toBuffer());
}

// ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes each), then concatenated PNGs.
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type = icon
dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((s, i) => {
	const b = 6 + i * 16;
	const w = s === 256 ? 0 : s; // 0 means 256 in ICO
	dir.writeUInt8(w, b);
	dir.writeUInt8(w, b + 1);
	dir.writeUInt8(0, b + 2); // palette colors (0 = none)
	dir.writeUInt8(0, b + 3); // reserved
	dir.writeUInt16LE(1, b + 4); // color planes
	dir.writeUInt16LE(32, b + 6); // bits per pixel
	dir.writeUInt32LE(pngs[i].length, b + 8);
	dir.writeUInt32LE(offset, b + 12);
	offset += pngs[i].length;
});

const ico = Buffer.concat([dir, ...pngs]);
await writeFile(join(resDir, "icon.ico"), ico);
await writeFile(join(resDir, "icon.png"), await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer());

console.log(`[build-icon] ✓ icon.ico (${ico.length} bytes, ${sizes.length} frames) + icon.png`);
