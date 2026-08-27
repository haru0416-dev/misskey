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
});
