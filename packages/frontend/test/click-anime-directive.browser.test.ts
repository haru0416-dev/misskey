/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent } from 'vue';

vi.mock('@/preferences.js', () => ({
	prefer: { animation: true },
}));

import { clickAnimeDirective } from '@/directives/click-anime.js';

describe('clickAnimeDirective', () => {
	afterEach(() => {
		cleanup();
	});

	test('reuses its mouseleave listener and removes all listeners on unmount', async () => {
		const Component = defineComponent({
			template: '<button v-click-anime><span>Icon</span></button>',
		});
		const result = render(Component, {
			global: {
				directives: { 'click-anime': clickAnimeDirective },
			},
		});
		const button = result.getByRole('button');
		const target = result.getByText('Icon');

		await fireEvent.mouseDown(button);
		await fireEvent.mouseDown(button);
		expect(target.classList.contains('_anime_bounce_ready')).toBe(true);
		await fireEvent.mouseLeave(target);
		expect(target.classList.contains('_anime_bounce_ready')).toBe(false);

		result.unmount();
		await fireEvent.mouseDown(button);
		expect(target.classList.contains('_anime_bounce_ready')).toBe(false);
	});
});
