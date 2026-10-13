/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'bun:test';
import { patchedVersions, pickUpdate, pickUpdateSkipping, splitHeldMajors, syncOverrides } from './update-deps.mjs';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 28);
const minAge = 7 * DAY;
const released = (version, daysAgo, deprecated = false) => ({ version, time: now - daysAgo * DAY, deprecated });

describe('pickUpdate', () => {
	test('同じメジャーの最新へ上げ、新しいメジャーは別に返す', () => {
		const versions = [released('1.2.3', 100), released('1.3.0', 30), released('1.4.1', 10), released('2.0.0', 20)];
		expect(pickUpdate('1.2.3', versions, now, minAge)).toEqual({ compatible: '1.4.1', major: '2.0.0' });
	});

	test('公開から期間が足りない版は選ばない', () => {
		const versions = [released('1.3.0', 30), released('1.4.0', 6), released('2.0.0', 1)];
		expect(pickUpdate('1.2.3', versions, now, minAge)).toEqual({ compatible: '1.3.0', major: null });
	});

	test('0.x はマイナーの違いをメジャー更新として扱う', () => {
		const versions = [released('0.221.1', 10), released('0.222.0', 10)];
		expect(pickUpdate('0.221.0', versions, now, minAge)).toEqual({ compatible: '0.221.1', major: '0.222.0' });
	});

	test('0.0.x は自動では上げない', () => {
		expect(pickUpdate('0.0.3', [released('0.0.4', 30)], now, minAge)).toEqual({ compatible: null, major: '0.0.4' });
	});

	test('プレリリース・非推奨・現在以下の版は選ばない', () => {
		const versions = [
			released('1.3.0-beta.1', 30),
			released('1.4.0', 30, true),
			released('1.1.0', 30),
			released('1.2.4', 30),
		];
		expect(pickUpdate('1.2.3', versions, now, minAge)).toEqual({ compatible: '1.2.4', major: null });
	});

	test('公開日時が不明な版は選ばない', () => {
		expect(pickUpdate('1.2.3', [{ version: '1.2.4', time: Number.NaN, deprecated: false }], now, minAge)).toEqual({
			compatible: null,
			major: null,
		});
	});
});

describe('pickUpdateSkipping', () => {
	const skip = { versions: ['3.3.12'] };

	test('飛ばす版しか新しい版が無ければ上げず、飛ばした版を返す', () => {
		const versions = [released('3.3.11', 50), released('3.3.12', 10)];
		expect(pickUpdateSkipping('3.3.11', versions, now, minAge, skip)).toEqual({
			compatible: null,
			major: null,
			skipped: '3.3.12',
		});
	});

	test('飛ばす版より古い互換版があればそこまで上げる', () => {
		const versions = [released('3.3.10', 60), released('3.3.11', 50), released('3.3.12', 10)];
		expect(pickUpdateSkipping('3.3.10', versions, now, minAge, skip)).toEqual({
			compatible: '3.3.11',
			major: null,
			skipped: '3.3.12',
		});
	});

	test('飛ばす版より新しい版が出ればそちらを選び、据え置きとして扱わない', () => {
		const versions = [released('3.3.11', 50), released('3.3.12', 20), released('3.3.13', 10)];
		expect(pickUpdateSkipping('3.3.11', versions, now, minAge, skip)).toEqual({
			compatible: '3.3.13',
			major: null,
			skipped: null,
		});
	});

	test('指定が無ければ pickUpdate と同じ版を選ぶ', () => {
		const versions = [released('3.3.11', 50), released('3.3.12', 10)];
		expect(pickUpdateSkipping('3.3.11', versions, now, minAge, undefined)).toEqual({
			compatible: '3.3.12',
			major: null,
			skipped: null,
		});
	});
});

describe('patchedVersions', () => {
	test('scope 付きを含む name@version を名前と版に分ける', () => {
		const result = patchedVersions({
			'@rushstack/ts-command-line@5.3.16': 'dependency-patches/a.patch',
			'sugar-high@2.5.1': 'dependency-patches/b.patch',
		});
		expect([...result]).toEqual([
			['@rushstack/ts-command-line', '5.3.16'],
			['sugar-high', '2.5.1'],
		]);
	});

	test('指定が無ければ空', () => {
		expect(patchedVersions(undefined).size).toBe(0);
	});
});

describe('splitHeldMajors', () => {
	const held = { typescript: { major: 7, reason: 'API がない' } };

	test('据え置いたメジャーだけを分け、理由を添える', () => {
		const { pending, held: kept } = splitHeldMajors(
			[
				{ name: 'typescript', from: '6.0.3', to: '7.0.2' },
				{ name: 'vitest', from: '4.1.11', to: '5.0.1' },
				{ name: 'typescript', from: '6.0.3', to: '8.0.0' },
			],
			held,
		);
		expect(pending).toEqual([
			{ name: 'vitest', from: '4.1.11', to: '5.0.1' },
			{ name: 'typescript', from: '6.0.3', to: '8.0.0' },
		]);
		expect(kept).toEqual([{ name: 'typescript', from: '6.0.3', to: '7.0.2', reason: 'API がない' }]);
	});
});

describe('syncOverrides', () => {
	test('直接の依存と同じ版に固定した override だけを一緒に上げる', () => {
		const overrides = { vitest: '5.0.1', sharp: '0.35.5', 'argparse@~1.0.9': '2.0.1' };
		const updated = [
			{ name: 'vitest', from: '5.0.1', to: '5.0.3' },
			{ name: 'sharp', from: '0.35.4', to: '0.35.6' },
			{ name: 'argparse', from: '1.0.9', to: '1.0.10' },
		];
		expect(syncOverrides(overrides, updated)).toEqual({
			vitest: '5.0.3',
			sharp: '0.35.5',
			'argparse@~1.0.9': '2.0.1',
		});
		expect(overrides.vitest).toBe('5.0.1');
	});

	test('変わらなければ null を返す', () => {
		expect(syncOverrides({ sharp: '0.35.5' }, [{ name: 'vitest', from: '5.0.1', to: '5.0.3' }])).toBeNull();
		expect(syncOverrides(undefined, [{ name: 'vitest', from: '5.0.1', to: '5.0.3' }])).toBeNull();
	});
});
