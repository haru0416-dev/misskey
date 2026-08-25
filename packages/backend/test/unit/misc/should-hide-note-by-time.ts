/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';

describe('misc:should-hide-note-by-time', () => {
	const epoch = Date.UTC(2000, 0, 1, 0, 0, 0);

	beforeEach(() => {
		vi.useFakeTimers({
			toFake: ['Date'],
			now: new Date(epoch),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('hiddenBefore が null または undefined の場合', () => {
		test('hiddenBefore が null のときは false を返す（非表示機能が有効でない）', () => {
			const createdAt = new Date(epoch - 86400000);
			expect(shouldHideNoteByTime(null, createdAt)).toBe(false);
		});

		test('hiddenBefore が undefined のときは false を返す（非表示機能が有効でない）', () => {
			const createdAt = new Date(epoch - 86400000);
			expect(shouldHideNoteByTime(undefined, createdAt)).toBe(false);
		});
	});

	describe('相対時間モード (hiddenBefore <= 0)', () => {
		test('閾値内に作成されたノートは false を返す（作成からの経過時間がまだ短い→表示）', () => {
			const hiddenBefore = -86400;
			const createdAt = new Date(epoch - 3600000);
			expect(shouldHideNoteByTime(hiddenBefore, createdAt)).toBe(false);
		});

		test('閾値を超えて作成されたノートは true を返す（指定期間以上経過している→非表示）', () => {
			const hiddenBefore = -86400;
			const createdAt = new Date(epoch - 172800000);
			expect(shouldHideNoteByTime(hiddenBefore, createdAt)).toBe(true);
		});

		test('ちょうど閾値で作成されたノートは true を返す（閾値に達したら非表示）', () => {
			const hiddenBefore = -86400;
			const createdAt = new Date(epoch - 86400000);
			expect(shouldHideNoteByTime(hiddenBefore, createdAt)).toBe(true);
		});

		test('ISO 8601 形式の文字列の createdAt に対応できる（文字列でも正しく判定）', () => {
			const createdAtString = new Date(epoch - 86400000).toISOString();
			const hiddenBefore = -86400;
			expect(shouldHideNoteByTime(hiddenBefore, createdAtString)).toBe(true);
		});

		test('hiddenBefore が 0 の場合に対応できる（0秒以上経過で非表示→ほぼ全て非表示）', () => {
			const hiddenBefore = 0;
			const createdAt = new Date(epoch - 1);
			expect(shouldHideNoteByTime(hiddenBefore, createdAt)).toBe(true);
		});
	});

	describe('絶対時間モード (hiddenBefore > 0)', () => {
		test('閾値タイムスタンプより後に作成されたノートは false を返す（指定日時より後→表示）', () => {
			const thresholdSeconds = Math.floor(epoch / 1000);
			const createdAt = new Date(epoch + 3600000);
			expect(shouldHideNoteByTime(thresholdSeconds, createdAt)).toBe(false);
		});

		test('閾値タイムスタンプより前に作成されたノートは true を返す（指定日時より前→非表示）', () => {
			const thresholdSeconds = Math.floor(epoch / 1000);
			const createdAt = new Date(epoch - 3600000);
			expect(shouldHideNoteByTime(thresholdSeconds, createdAt)).toBe(true);
		});

		test('ちょうど閾値タイムスタンプで作成されたノートは true を返す（指定日時に達したら非表示）', () => {
			const thresholdSeconds = Math.floor(epoch / 1000);
			const createdAt = new Date(epoch);
			expect(shouldHideNoteByTime(thresholdSeconds, createdAt)).toBe(true);
		});

		test('ISO 8601 形式の文字列の createdAt に対応できる（文字列でも正しく判定）', () => {
			const thresholdSeconds = Math.floor(epoch / 1000);
			const createdAtString = new Date(epoch - 3600000).toISOString();
			expect(shouldHideNoteByTime(thresholdSeconds, createdAtString)).toBe(true);
		});
	});
});
