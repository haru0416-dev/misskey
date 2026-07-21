/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 全 .vue の template を Vue のコンパイラに通し、パースエラーを検出する。
//
// oxlint も vue-tsc も template の構文 (属性の重複など) は見ないため、
// この検査が無いと `bun run build` で初めて落ちる。実際に MkYouTubePlayer.vue で
// :style が重複したままビルドが壊れていたのを取りこぼした (cd3023da14)。
// フルビルドは重いので、パースだけを lint に組み込んでいる。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from '@vue/compiler-sfc';

// シェルを経由しないよう execFile 形式で呼ぶ (glob は git の pathspec が解釈する)
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
