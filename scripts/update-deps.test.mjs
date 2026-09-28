/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'bun:test';
import { pickUpdate, splitHeldMajors } from './update-deps.mjs';

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

describe('splitHeldMajors', () => {
	const held = { typescript: { major: 7, reason: 'API がない' } };

	test('据え置いたメジャーだけを分け、理由を添える', () => {
		const { pending, held: kept } = splitHeldMajors(
			[
				{ name: 'typescript', from: '6.0.3', to: '7.0.2' },
				{ name: 'vitest', from: '4.1.11', to: '5.0.1' },
			],
			held,
		);
		expect(pending).toEqual([{ name: 'vitest', from: '4.1.11', to: '5.0.1' }]);
		expect(kept).toEqual([{ name: 'typescript', from: '6.0.3', to: '7.0.2', reason: 'API がない' }]);
	});

	test('次のメジャーが出たら判断対象に戻す', () => {
		const { pending, held: kept } = splitHeldMajors([{ name: 'typescript', from: '6.0.3', to: '8.0.0' }], held);
		expect(pending).toHaveLength(1);
		expect(kept).toHaveLength(0);
	});

});
