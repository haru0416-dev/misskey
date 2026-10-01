/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const lowerLayers = ['src/core', 'src/db', 'src/misc', 'src/models'];
const outerLayers = ['src/server/', 'src/queue/', 'src/boot/'];
const importPattern = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)'([^']+)'/gm;

function sourceFiles(directory: string): string[] {
	return readdirSync(join(backend, directory), { withFileTypes: true }).flatMap((entry) => {
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
	});
}

function resolveImport(importer: string, specifier: string): string | null {
	let base: string;
	if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`;
	else if (specifier.startsWith('.')) base = normalize(join(dirname(importer), specifier));
	else return null;
	const stem = base.replace(/\.js$/, '');
	for (const candidate of [`${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`]) {
		if (existsSync(join(backend, candidate))) return relative(backend, join(backend, candidate));
	}
	return null;
}

test('core・db・misc・models は HTTP・queue・起動の層を import しない', () => {
	// 投稿処理などの共有処理は REST・ActivityPub・queue の各入口から呼ばれる。下位の層が入口側の
	// モジュールに依存すると、入口の都合 (HTTP エラー・入力検証・ハンドラ) が共有処理へ入り込む。
	const files = lowerLayers.flatMap(sourceFiles);
	const violations: string[] = [];
	let resolved = 0;
	for (const file of files) {
		for (const match of readFileSync(join(backend, file), 'utf8').matchAll(importPattern)) {
			const target = resolveImport(file, match[1]!);
			if (target == null) continue;
			resolved++;
			if (outerLayers.some((layer) => target.startsWith(layer))) violations.push(`${file} -> ${target}`);
		}
	}
	// 抽出が空振りしていないことを、解決できた import の件数で確かめる。
	expect(files.length).toBeGreaterThan(300);
	expect(resolved).toBeGreaterThan(1000);
	expect(violations).toStrictEqual([]);
});
