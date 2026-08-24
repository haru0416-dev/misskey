/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 追跡下の Markdown が張っているリポジトリ内リンクの参照先が実在するかを検査する。
//
// ドキュメントはコードの移動に追従しないため、リンク切れはレビューでも気づかれずに残る
// (frontend の components/ 再編で 30 箇所が同時に切れた実績がある)。
// 外部 URL の到達性は見ない。ネットワークに触らずミリ秒で終わる範囲に限定している。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// 生成物なので対象外
const excludedPrefixes = ['packages/misskey-js/etc/', 'packages/misskey-js/temp/'];

const skippedSchemes = /^(https?:|mailto:|tel:|data:|\/\/)/;

// [text](target) と [text](<target>)。target 内の丸括弧は扱わない (Markdown 側で避ける)
const inlineLinkRegexp = /\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))/g;
// 参照定義 [label]: target
const referenceDefRegexp = /^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]*)>|(\S+))/;

function targetsInLine(line) {
	const targets = [];
	const referenceDef = line.match(referenceDefRegexp);
	if (referenceDef) {
		targets.push(referenceDef[1] ?? referenceDef[2]);
	}
	for (const match of line.matchAll(inlineLinkRegexp)) {
		targets.push(match[1] ?? match[2]);
	}
	return targets;
}

function resolveTarget(target, mdPath) {
	// アンカー・クエリを落とす。パス部分が空ならページ内リンクなので検査対象外
	const path = decodeURIComponent(target.split('#')[0].split('?')[0]);
	if (path === '') return null;
	return path.startsWith('/') ? resolve(path.slice(1)) : resolve(dirname(mdPath), path);
}

const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
	.split('\n')
	.filter((f) => f !== '' && !excludedPrefixes.some((p) => f.startsWith(p)));

const broken = [];
for (const file of files) {
	const lines = readFileSync(file, { encoding: 'utf8' }).split('\n');
	let inCodeFence = false;
	for (const [index, line] of lines.entries()) {
		if (/^\s*(```|~~~)/.test(line)) {
			inCodeFence = !inCodeFence;
			continue;
		}
		if (inCodeFence) continue;

		for (const target of targetsInLine(line)) {
			if (skippedSchemes.test(target) || target.startsWith('#')) continue;
			const resolved = resolveTarget(target, file);
			if (resolved !== null && !existsSync(resolved)) {
				broken.push(`${file}:${index + 1}\t${target}`);
			}
		}
	}
}

if (broken.length > 0) {
	console.error(`ドキュメントのリンク切れ: ${broken.length} 件`);
	for (const entry of broken) console.error(`  ${entry}`);
	process.exit(1);
}

console.log(`ドキュメントのリンク: ${files.length} ファイル OK`);
