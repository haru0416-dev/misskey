/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun ランタイムで `vitest --config vitest.config.e2e.ts` を実行すると (`include` glob
// 経由でも明示ファイル引数でも)、test/e2e/*.ts が一定数を超えた時点で
// `src/models/User.ts` の `import { z } from 'zod'` が未初期化のまま参照され
// `TypeError: undefined is not an object (evaluating 'z.string')` が発生し、
// 全テストファイルが即座に失敗する。同じコマンドを Node.js で実行すると再現しない
// (Bun 1.3.14 時点のバグと推測、詳細は
// .claude/skills/working-on-backend/references/knowledge/backend-testing.md 参照)。
//
// `bun run --bun` はスクリプト文字列内に `node ...` と明示していても Bun 自身で
// 実行してしまう (`--bun` フラグの仕様) ため、package.json 側の対策では回避できない。
// このファイル自身が Bun で起動されたことを検知したら、本物の Node.js で自分自身を
// 再起動することで確実に Node.js 上で vitest を実行させる
// (node の解決方法とフォーク爆弾対策は respawn_with_node.js のコメント参照)。
if (typeof Bun !== 'undefined') {
	const { respawnWithNode } = await import('./respawn_with_node.js');
	await respawnWithNode(); // 戻ってこない (子プロセスの終了コードで exit する)
}

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

function findTestFiles(dir) {
	const results = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findTestFiles(full));
		} else if (entry.name.endsWith('.ts')) {
			results.push(full);
		}
	}
	return results;
}

const files = findTestFiles('test/e2e').sort();
const extraArgs = process.argv.slice(2);

const result = await execa('vitest', ['run', '--config', 'vitest.config.e2e.ts', ...extraArgs, ...files], {
	stdout: process.stdout,
	stderr: process.stderr,
	preferLocal: true,
	reject: false,
});

process.exit(result.exitCode ?? 1);
