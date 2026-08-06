/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun ランタイムで起動されたスクリプトを、本物の Node.js で再起動するためのヘルパー。
//
// 背景: vitest を Bun ランタイムで実行すると ESM 初期化バグで全テストが即死するため
// (詳細は .claude/skills/working-on-backend/references/knowledge/backend-testing.md 参照)、
// run_unit.js / run_e2e.js は Bun で起動されたことを検知したら Node.js で自分自身を
// 再起動する。
//
// ★ 重大な落とし穴: `bun run --bun` は PATH の先頭に一時ディレクトリ
// (/tmp/bun-node-<hash>/) を注入し、その中の `node` は bun 本体への symlink になっている。
// そのため素朴に `execa('node', ...)` すると子プロセスもまた Bun になり、
// 「Bun 検知 → node で再起動 → やっぱり Bun → 再起動 → ...」の無限再帰でプロセスが
// 際限なく積み上がる (実際に 600 プロセス超のフォーク爆弾でホストがフリーズした)。
// これを避けるため、PATH を走査して「realpath が bun 実行ファイルと一致しない本物の
// node」を解決してから再起動する。さらに万一の解決失敗に備え、環境変数による再帰
// ガードで 2 段目以降の respawn を構造的に禁止する。

import { existsSync, realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * 呼び出し元スクリプト (process.argv[1]) を本物の Node.js で再起動し、
 * その終了コードで process.exit する。戻ってこない。
 */
export async function respawnWithNode() {
	if (process.env.MISSKEY_RESPAWNED_FOR_NODE === '1') {
		console.error(
			'[respawn_with_node] respawn loop detected: already respawned once but still running under Bun. ' +
				'Refusing to respawn again to avoid a fork bomb.',
		);
		process.exit(1);
	}

	const bunRealPath = realpathSync(process.execPath);
	let nodePath = null;
	const cleanPathDirs = [];
	for (const dir of (process.env.PATH ?? '').split(delimiter)) {
		if (dir === '') continue;
		const candidate = join(dir, 'node');
		let isShimDir = false;
		try {
			if (existsSync(candidate)) {
				if (realpathSync(candidate) === bunRealPath) {
					isShimDir = true;
				} else if (nodePath == null) {
					nodePath = candidate;
				}
			}
		} catch {
			// 壊れた symlink 等はスキップ
		}
		if (!isShimDir) cleanPathDirs.push(dir);
	}

	if (nodePath == null) {
		console.error('[respawn_with_node] real Node.js executable not found in PATH (every `node` resolves to bun).');
		process.exit(1);
	}

	// shim ディレクトリを除去した PATH を子プロセスに渡す。これをしないと、たとえ
	// このスクリプト自身は本物の node で再起動できても、そこから spawn する
	// `node_modules/.bin/vitest` (shebang: `#!/usr/bin/env node`) やその worker が
	// shim 経由で再び Bun になってしまう。
	const cleanPath = cleanPathDirs.join(delimiter);

	const { execa } = await import('execa');
	const result = await execa(nodePath, [process.argv[1], ...process.argv.slice(2)], {
		stdout: process.stdout,
		stderr: process.stderr,
		reject: false,
		env: { ...process.env, PATH: cleanPath, MISSKEY_RESPAWNED_FOR_NODE: '1' },
	});
	process.exit(result.exitCode ?? 1);
}
