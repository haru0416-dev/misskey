/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { toStoredAnnouncementReaction } from '@/features/announcements/reaction-key.js';

describe('toStoredAnnouncementReaction', () => {
	test('ローカルのカスタム絵文字はホスト部を落とす', () => {
		expect(toStoredAnnouncementReaction(':my_emoji@.:')).toBe(':my_emoji:');
	});

	test('Unicode 絵文字はそのまま', () => {
		expect(toStoredAnnouncementReaction('👍')).toBe('👍');
	});

	test('ホスト部の無いカスタム絵文字はそのまま', () => {
		expect(toStoredAnnouncementReaction(':my_emoji:')).toBe(':my_emoji:');
	});

	test('異体字セレクタ (U+FE0F) を落とす', () => {
		// ピッカーは ❤️ (VS16 付き) を返すが、サーバーは ❤ で保存する。
		// 揃えないと同じ絵文字が 2 行に分かれる。
		expect(toStoredAnnouncementReaction('\u2764\ufe0f')).toBe('\u2764');
		expect(toStoredAnnouncementReaction('\u2764')).toBe('\u2764');
	});

	test('ZWJ で繋がる絵文字は異体字セレクタを残す', () => {
		// 落とすと別の字になる (👨‍👩‍👧 等)。サーバーも同じ扱い。
		const family = '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67';
		expect(toStoredAnnouncementReaction(family)).toBe(family);
		const rainbowFlag = '\ud83c\udff3\ufe0f\u200d\ud83c\udf08';
		expect(toStoredAnnouncementReaction(rainbowFlag)).toBe(rainbowFlag);
	});
});
