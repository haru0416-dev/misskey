/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseChangeLog } from '../src/parser.js';

describe('parseChangeLog', () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-checker-'));
		file = path.join(dir, 'CHANGELOG.md');
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function parse(markdown: string) {
		fs.writeFileSync(file, markdown);
		return parseChangeLog(file);
	}

	it('リリース構造を読み取り、カテゴリ外・ネスト・コードフェンス・不正な区切りの項目を除く', () => {
		const releases = parse(
			[
				'## Unreleased',
				'- カテゴリ外の項目',
				'',
				'### General',
				'- Feat: A',
				'  - ネストされた詳細1',
				'  - ネストされた詳細2',
				'- Fix: B',
				'```',
				'- これは項目ではない',
				'## これはリリースではない',
				'```',
				'-',
				'-　全角スペース区切りは項目ではない',
				'--- これも項目ではない',
				'',
				'### Server',
				'- Enhance: C',
				'',
				'## 1.0.0',
				'',
				'### Client',
				'- Fix: D',
			].join('\n'),
		);

		expect(
			releases.map((release) => ({
				name: release.releaseName,
				categories: release.categories.map((category) => ({
					name: category.categoryName,
					items: category.items,
				})),
			})),
		).toEqual([
			{
				name: 'Unreleased',
				categories: [
					{ name: 'General', items: ['Feat: A', 'Fix: B', ''] },
					{ name: 'Server', items: ['Enhance: C'] },
				],
			},
			{ name: '1.0.0', categories: [{ name: 'Client', items: ['Fix: D'] }] },
		]);
	});
});
