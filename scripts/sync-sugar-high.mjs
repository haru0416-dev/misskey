/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// コードの色付けに使う sugar-high は、調整したフォーク (vinculum と共有) から実行に要るファイルだけを
// packages/sugar-high に写して使う。フォークは調査用のデータや独自の開発ツールを含むので、
// subtree では取り込まない。調整はフォークで行い、この script で写し直す。
//
// 使い方: bun scripts/sync-sugar-high.mjs <フォークのディレクトリ>
// フォークの作業ツリーに未コミットの変更があると止まる (写した版をコミットで特定できなくなるため)。

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 実行時に読むのは lib だけ。LICENSE は MIT の表示のために写す。
const COPIED = ['lib', 'LICENSE'];
// package.json は exports などの読み込みに要る項目だけを残す。workspace の devDependencies も install されるので、
// フォークの開発ツール (vite-plus、typescript など) や scripts を Misskey に持ち込まないようにする。
const KEPT_PACKAGE_FIELDS = ['name', 'version', 'description', 'license', 'type', 'sideEffects', 'exports'];

const source = process.argv[2];
if (source == null) {
	console.error('使い方: bun scripts/sync-sugar-high.mjs <フォークのディレクトリ>');
	process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const target = join(root, 'packages', 'sugar-high');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();

if (git('status', '--porcelain') !== '') {
	console.error(`${source} に未コミットの変更があります。コミットしてから写してください。`);
	process.exit(1);
}

for (const name of [...COPIED, 'package.json']) {
	if (!existsSync(join(source, name))) {
		console.error(`${join(source, name)} がありません。`);
		process.exit(1);
	}
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of COPIED) {
	cpSync(join(source, name), join(target, name), { recursive: true });
}
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const trimmed = Object.fromEntries(
	KEPT_PACKAGE_FIELDS.filter((key) => key in manifest).map((key) => [key, manifest[key]]),
);
writeFileSync(join(target, 'package.json'), `${JSON.stringify(trimmed, null, '\t')}\n`);

const commit = git('rev-parse', 'HEAD');
const subject = git('log', '-1', '--format=%s');
writeFileSync(
	join(target, 'VENDORED.md'),
	`# sugar-high (vendored)\n\n` +
		`このディレクトリは \`scripts/sync-sugar-high.mjs\` が書き出す。直接編集せず、フォークを直してから写し直す。\n\n` +
		`- 写したコミット: \`${commit}\` (${subject})\n` +
		`- 写したもの: ${COPIED.map((name) => `\`${name}\``).join('、')}、\`package.json\` の ${Object.keys(trimmed).join(', ')}\n`,
);

console.log(`${commit.slice(0, 7)} (${subject}) を packages/sugar-high に写しました。`);
