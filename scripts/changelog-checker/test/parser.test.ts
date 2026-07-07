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

	it('リリース・カテゴリ・トップレベル項目を構造として読み取れる', () => {
		const releases = parse(
			[
				'## Unreleased',
				'',
				'### General',
				'- Feat: A',
				'- Fix: B',
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

		expect(releases.map((r) => r.releaseName)).toEqual(['Unreleased', '1.0.0']);
		expect(releases[0].categories.map((c) => c.categoryName)).toEqual(['General', 'Server']);
		expect(releases[0].categories[0].items).toEqual(['Feat: A', 'Fix: B']);
		expect(releases[1].categories[0].items).toEqual(['Fix: D']);
	});

	it('インデントされたネスト項目は数えない', () => {
		const releases = parse(
			[
				'## Unreleased',
				'### General',
				'- Fix: 親項目',
				'  - ネストされた詳細1',
				'  - ネストされた詳細2',
				'- Feat: 次の項目',
			].join('\n'),
		);

		expect(releases[0].categories[0].items).toHaveLength(2);
	});

	it('コードフェンス内の行は無視する', () => {
		const releases = parse(
			[
				'## Unreleased',
				'### General',
				'- Fix: 項目',
				'```',
				'- これは項目ではない',
				'## これはリリースではない',
				'```',
			].join('\n'),
		);

		expect(releases).toHaveLength(1);
		expect(releases[0].categories[0].items).toHaveLength(1);
	});

	it('中身が空の bullet も 1 項目として数える', () => {
		const releases = parse(['## Unreleased', '### General', '-'].join('\n'));

		expect(releases[0].categories[0].items).toEqual(['']);
	});

	it('bullet の直後が ASCII 空白でない行は項目として数えない', () => {
		const releases = parse(
			[
				'## Unreleased',
				'### General',
				'- 通常の項目',
				'-　全角スペース区切りは項目ではない',
				'--- これも項目ではない',
			].join('\n'),
		);

		expect(releases[0].categories[0].items).toHaveLength(1);
	});

	it('カテゴリより前の箇条書きは無視する', () => {
		const releases = parse(['## Unreleased', '- カテゴリ外の項目', '### General', '- カテゴリ内の項目'].join('\n'));

		expect(releases[0].categories[0].items).toEqual(['カテゴリ内の項目']);
	});
});
