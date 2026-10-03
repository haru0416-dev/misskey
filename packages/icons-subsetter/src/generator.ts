/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';
import { generateSubsettedFont } from './subsetter.js';
import { runWriteTasks } from './write-tasks.js';

const repoRoot = path.resolve(process.cwd(), '../../');
const frontendSrc = path.join(repoRoot, 'packages/frontend/src');
const embedDir = path.join(frontendSrc, 'embed');

async function* globFiles(pattern: string): AsyncGenerator<string> {
	for await (const file of fsp.glob(pattern, { cwd: repoRoot })) {
		yield path.resolve(repoRoot, file);
	}
}

// import 文・export ... from・動的 import の読み込み先。型だけの import (import type / export type) はバンドルに入らないので外す。
const importRegex =
	/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

function resolveImport(from: string, specifier: string): string | null {
	const spec = specifier.split('?')[0]!;
	let base: string;
	if (spec.startsWith('@/')) {
		base = path.join(frontendSrc, spec.slice(2));
	} else if (spec.startsWith('.')) {
		base = path.resolve(path.dirname(from), spec);
	} else {
		return null;
	}
	const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.vue`, path.join(base, 'index.ts')];
	return candidates.find((c) => /\.(ts|vue)$/.test(c) && existsSync(c)) ?? null;
}

// 埋め込みは src/embed/ の外にある本体の部品も使うので、起動コードから import でたどれるファイルを走査する。
async function* reachableFiles(entry: string): AsyncGenerator<string> {
	const seen = new Set<string>();
	const stack = [entry];
	for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
		if (seen.has(file)) continue;
		seen.add(file);
		yield file;
		const content = await fsp.readFile(file, 'utf-8');
		for (const [, staticSpecifier, dynamicSpecifier] of content.matchAll(importRegex)) {
			const resolved = resolveImport(file, (staticSpecifier ?? dynamicSpecifier)!);
			if (resolved !== null) stack.push(resolved);
		}
	}
}

async function* frontendFiles(): AsyncGenerator<string> {
	for await (const file of globFiles('packages/frontend/src/**/*.{ts,vue}')) {
		if (!file.startsWith(embedDir + path.sep)) yield file;
	}
}

const filesToScan: Record<string, () => AsyncGenerator<string>> = {
	frontend: frontendFiles,
	frontendEmbed: () => reachableFiles(path.join(embedDir, 'boot.ts')),
};

async function main() {
	const start = performance.now();

	if (existsSync('./built')) {
		await fsp.rm('./built', { recursive: true });
	}
	await fsp.mkdir('./built');

	const css = await fsp.readFile('vendor/tabler-icons/tabler-icons.min.css', 'utf-8');
	const cssRegex = /\.(ti-[a-z0-9-]+)::?before\s*{\n?\s*content:\s*["']\\([a-fA-F0-9]+)["'];?\n?\s*}/g;
	const rgMap = new Map<string, string>();
	let matches: RegExpExecArray | null;
	while ((matches = cssRegex.exec(css)) !== null) {
		const [, icon, unicode] = matches;
		if (icon !== undefined && unicode !== undefined) {
			rgMap.set(icon, unicode);
		}
	}

	const classesByUnicode = new Map<number, string[]>();
	for (const [className, unicode] of rgMap) {
		const codePoint = Number.parseInt(unicode, 16);
		const classNames = classesByUnicode.get(codePoint);
		if (classNames === undefined) {
			classesByUnicode.set(codePoint, [className]);
		} else {
			classNames.push(className);
		}
	}

	const classTiBaseRule = css.match(/\.ti\s*{[^}]*}/)?.[0];
	if (classTiBaseRule === undefined) {
		throw new Error('Tabler Icons base CSS rule was not found.');
	}

	const fontPath = 'vendor/tabler-icons/fonts/';
	await fsp.copyFile(fontPath + 'tabler-icons.woff2', './built/tabler-icons.woff2');

	const unicodeRangeValues = new Map<string, number[]>();
	for (const [key, listFiles] of Object.entries(filesToScan)) {
		console.log(`Scanning ${key}...`);

		const iconsToPack = new Set<string>();

		for await (const file of listFiles()) {
			const content = await fsp.readFile(file, 'utf-8');
			const classRegex = /ti-[a-z0-9-]+/g;
			let matches: RegExpExecArray | null;
			while ((matches = classRegex.exec(content)) !== null) {
				const icon = matches[0];
				if (rgMap.has(icon)) {
					iconsToPack.add(icon);
				}
			}
		}

		const unicodeValues = Array.from(iconsToPack).map((icon) => Number.parseInt(rgMap.get(icon)!, 16));
		unicodeRangeValues.set(key, unicodeValues);
	}

	const subsettedFonts = await generateSubsettedFont(fontPath + 'tabler-icons.ttf', unicodeRangeValues);

	await runWriteTasks(
		Array.from(subsettedFonts.entries()).map(([key, buffer]) => async () => {
			const unicodeValues = unicodeRangeValues.get(key);
			if (unicodeValues === undefined) {
				throw new Error(`Unicode values for ${key} were not found.`);
			}

			const cssRules = [
				`@font-face {
	font-family: "tabler-icons";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("./tabler-icons.woff2") format("woff2");
}`,
			];

			if (unicodeValues.length > 0) {
				await fsp.writeFile(`./built/tabler-icons-${key}.woff2`, buffer);

				const unicodeRangeString = (() => {
					const values = unicodeValues.toSorted((a, b) => a - b);
					const ranges = [];

					for (let i = 0; i < values.length; i++) {
						const start = values[i];
						if (start === undefined) {
							continue;
						}
						let end = start;
						while (true) {
							const next = values[i + 1];
							if (next !== end + 1) {
								break;
							}
							end = next;
							i++;
						}
						if (start === end) {
							ranges.push(`U+${start.toString(16)}`);
						} else if (start + 1 === end) {
							ranges.push(`U+${start.toString(16)}`, `U+${end.toString(16)}`);
						} else {
							ranges.push(`U+${start.toString(16)}-${end.toString(16)}`);
						}
					}

					return ranges.join(', ');
				})();

				cssRules.push(`@font-face {
	font-family: "tabler-icons";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("./tabler-icons-${key}.woff2") format("woff2");
	unicode-range: ${unicodeRangeString};
}`);

				cssRules.push(classTiBaseRule);

				for (const icon of unicodeValues) {
					const iconClasses = classesByUnicode.get(icon) ?? [];
					if (iconClasses.length > 1) {
						console.warn(
							`[WARN] Multiple classes for the same unicode: ${iconClasses.join(', ')}. Maybe it's deprecated?`,
						);
					}
					const iconSelector = iconClasses.map((className) => `.${className}::before`).join(', ');
					cssRules.push(`${iconSelector} { content: "\\${icon.toString(16)}"; }`);
				}
			}

			await fsp.writeFile(`./built/tabler-icons-${key}.css`, cssRules.join('\n') + '\n');
		}),
	);

	const end = performance.now();
	console.log(`Done in ${Math.round((end - start) * 100) / 100}ms`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
