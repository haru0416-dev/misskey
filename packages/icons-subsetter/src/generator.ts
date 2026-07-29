/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';
import { generateSubsettedFont } from './subsetter.js';

const filesToScan = {
	frontend: 'packages/frontend/src/**/*.{ts,vue}',
	// frontendSharedは現在アイコン使用箇所がないため未生成。有効化する場合は利用側で生成CSSもimportする。
	//frontendShared: 'packages/frontend-shared/utility/**/*.{ts}',
	frontendEmbed: 'packages/frontend-embed/src/**/*.{ts,vue}',
};

async function main() {
	const start = performance.now();

	if (existsSync('./built')) {
		await fsp.rm('./built', { recursive: true });
	}
	await fsp.mkdir('./built');

	const css = await fsp.readFile('node_modules/@tabler/icons-webfont/dist/tabler-icons.min.css', 'utf-8');
	const cssRegex = /\.(ti-[a-z0-9-]+)::?before\s*{\n?\s*content:\s*["']\\([a-fA-F0-9]+)["'];?\n?\s*}/g;
	const rgMap = new Map<string, string>();
	let matches: RegExpExecArray | null;
	while ((matches = cssRegex.exec(css)) !== null) {
		const [, icon, unicode] = matches;
		if (icon !== undefined && unicode !== undefined) rgMap.set(icon, unicode);
	}

	const classTiBaseRule = css.match(/\.ti\s*{[^}]*}/)?.[0];
	if (classTiBaseRule === undefined) throw new Error('Tabler Icons base CSS rule was not found.');

	const fontPath = 'node_modules/@tabler/icons-webfont/dist/fonts/';
	await fsp.copyFile(fontPath + 'tabler-icons.woff2', './built/tabler-icons.woff2');

	const unicodeRangeValues = new Map<string, number[]>();
	for (const [key, dir] of Object.entries(filesToScan)) {
		console.log(`Scanning ${key}...`);

		const iconsToPack = new Set<string>();

		const cwd = path.resolve(process.cwd(), '../../');
		const files = fsp.glob(dir, { cwd });
		for await (const file of files) {
			//console.log(`Scanning ${file}`);
			const content = await fsp.readFile(path.resolve(cwd, file), 'utf-8');
			const classRegex = /ti-[a-z0-9-]+/g;
			let matches: RegExpExecArray | null;
			while ((matches = classRegex.exec(content)) !== null) {
				const icon = matches[0];
				if (rgMap.has(icon)) {
					iconsToPack.add(icon);
				}
			}
		}

		const unicodeValues = Array.from(iconsToPack).map((icon) => parseInt(rgMap.get(icon)!, 16));
		unicodeRangeValues.set(key, unicodeValues);
	}

	const subsettedFonts = await generateSubsettedFont(fontPath + 'tabler-icons.ttf', unicodeRangeValues);

	await Promise.allSettled(Array.from(subsettedFonts.entries()).map(async ([key, buffer]) => {
		const unicodeValues = unicodeRangeValues.get(key);
		if (unicodeValues === undefined) throw new Error(`Unicode values for ${key} were not found.`);

		const cssRules = [`@font-face {
	font-family: "tabler-icons";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("./tabler-icons.woff2") format("woff2");
}`];

		// サブセット化したフォントの中身がある（＝unicodeRangeValuesの配列が空ではない）場合のみ、サブセットしたものに関する情報を追記
		if (unicodeValues.length > 0) {
			await fsp.writeFile(`./built/tabler-icons-${key}.woff2`, buffer);

			const unicodeRangeString = (() => {
				const values = unicodeValues.sort((a, b) => a - b);
				const ranges = [];

				for (let i = 0; i < values.length; i++) {
					const start = values[i];
					if (start === undefined) continue;
					let end = start;
					while (true) {
						const next = values[i + 1];
						if (next !== end + 1) break;
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

			// 使用されているアイコンのclassとの対応を追記
			for (const icon of unicodeValues) {
				const iconClasses = Array.from(rgMap.entries()).filter(([_, unicode]) => parseInt(unicode, 16) === icon);
				if (iconClasses.length > 1) {
					console.warn(`[WARN] Multiple classes for the same unicode: ${iconClasses.map(([cls]) => cls).join(', ')}. Maybe it's deprecated?`);
				}
				const iconSelector = iconClasses.map(([className]) => `.${className}::before`).join(', ');
				cssRules.push(`${iconSelector} { content: "\\${icon.toString(16)}"; }`);
			}
		}

		await fsp.writeFile(`./built/tabler-icons-${key}.css`, cssRules.join('\n') + '\n');
	}));

	const end = performance.now();
	console.log(`Done in ${Math.round((end - start) * 100) / 100}ms`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
