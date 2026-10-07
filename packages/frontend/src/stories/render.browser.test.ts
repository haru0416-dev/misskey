/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, h } from 'vue';
import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { buildStoryComponent, createStoryContext } from './render.js';
import type { StoryObj } from './types.js';

describe('story decorators', () => {
	test('preserves inner-to-outer interaction order through nested decorators', async () => {
		const events: string[] = [];
		const inner = { render: () => h('button', { onClick: () => events.push('story') }, 'Activate') };
		const story: StoryObj = {
			render: () => inner,
			decorators: ['section', 'article'].map((tag) => (getStory) => {
				return { render: () => h(tag, { onClick: () => events.push(tag) }, [h(getStory())]) };
			}),
		};
		const container = document.createElement('div');
		document.body.appendChild(container);
		const component = buildStoryComponent(story, createStoryContext(story, container));

		const app = createApp(component);
		try {
			app.mount(container);
			await page.getByRole('button', { name: 'Activate' }).click();
			expect(events).toEqual(['story', 'section', 'article']);
		} finally {
			app.unmount();
			container.remove();
		}
	});
});
