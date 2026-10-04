/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import { preferState } from './init.js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkEmoji from '@/components/global/MkEmoji.vue';

describe('Emoji', () => {
	const renderEmoji = (emoji: string): RenderResult => {
		return render(MkEmoji, {
			props: { emoji },
			global: { directives, components },
		});
	};

	afterEach(() => {
		cleanup();
		preferState.emojiStyle = '';
	});

	describe('MkEmoji', () => {
		test('Should render selector-less heart with color and its name on hover in native mode', async () => {
			preferState.emojiStyle = 'native';
			const mkEmoji = await renderEmoji('\u2764'); // 単色のハート
			const heart = mkEmoji.getByText('\u2764\uFE0F');
			assert.ok(heart); // カラー絵文字のハート
			assert.ok(!mkEmoji.queryByText('\u2764'));
			await fireEvent.pointerEnter(heart);
			assert.strictEqual(heart.title, 'heart');
		});
	});
});
