/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// e2e (scripts/run_e2e.js) と同じ Bun ランタイムの ESM 初期化バグの影響で、unit テストも
// Bun 上で vitest を実行すると多数のテストファイルを読み込んだ際に
// `[vite] The requested module 'zod' does not provide an export named 'z'` が発生し、
// 全テストファイルが即座に失敗する (詳細は
// .claude/skills/working-on-backend/references/knowledge/backend-testing.md 参照)。
// `bun run --bun` はスクリプト文字列内に `vitest ...` と書いていても Bun 自身で
// 実行してしまう (`--bun` フラグの仕様) ため、package.json 側の対策では回避できない。
// このファイル自身が Bun で起動されたことを検知したら、本物の Node.js で自分自身を
// 再起動することで確実に Node.js 上で vitest を実行させる
// (node の解決方法とフォーク爆弾対策は respawn_with_node.js のコメント参照)。
if (typeof Bun !== 'undefined') {
	const { respawnWithNode } = await import('./respawn_with_node.js');
	await respawnWithNode(); // 戻ってこない (子プロセスの終了コードで exit する)
}

import { execa } from 'execa';

const extraArgs = process.argv.slice(2);

// `run` を明示しないと、execa 経由で stdin が TTY でなくなる状況で vitest が
// watch モードに入ってしまい、プロセスが終了せず残り続ける (ビルド成果物の変化等で
// 再起動を繰り返し、プロセスが際限なく積み上がる事故につながった)。
const result = await execa('vitest', ['run', '--config', 'vitest.config.unit.ts', ...extraArgs], {
	stdout: process.stdout,
	stderr: process.stderr,
	preferLocal: true,
	reject: false,
});

process.exit(result.exitCode ?? 1);
