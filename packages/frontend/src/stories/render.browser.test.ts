/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, h } from 'vue';
import { describe, expect, test } from 'vitest';
import { buildStoryComponent, createStoryContext } from './render.js';
import type { StoryObj } from './types.js';

describe('story decorators', () => {
	test('renders nested story decorators in order', () => {
		const inner = { render: () => h('span', 'story') };
		const story: StoryObj = {
			render: () => inner,
			decorators: ['section', 'article'].map((tag) => (getStory) => {
				return { render: () => h(tag, [h(getStory())]) };
			}),
		};
		const container = document.createElement('div');
		const component = buildStoryComponent(story, createStoryContext(story, container));

		const app = createApp(component);
		try {
			app.mount(container);
			expect(container.innerHTML).toBe('<article><section><span>story</span></section></article>');
		} finally {
			app.unmount();
		}
	});
});
