/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// SFC の構文エラーをフルビルド前に検出する。型検査とは独立した検査として lint から実行する。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from '@vue/compiler-sfc';

const files = execFileSync('git', ['ls-files', 'packages/**/*.vue'], { encoding: 'utf8' })
	.trim()
	.split('\n')
	.filter(Boolean);

let failed = 0;
for (const file of files) {
	const { errors } = parse(readFileSync(file, 'utf8'), { filename: file });
	for (const error of errors) {
		const loc = error.loc == null ? '' : `:${error.loc.start.line}:${error.loc.start.column}`;
		console.error(`${file}${loc}: ${error.message}`);
		failed++;
	}
}

if (failed > 0) {
	console.error(`\n${failed} 件のテンプレートエラー (${files.length} ファイル中)`);
	process.exit(1);
}

console.log(`Vue テンプレート: ${files.length} ファイル OK`);
