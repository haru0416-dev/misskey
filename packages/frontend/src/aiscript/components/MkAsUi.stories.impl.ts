/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import type { StoryObj } from '@/stories/types.js';
import MkAsUi from './MkAsUi.vue';

export const Default = {
	render: (args) => ({
		components: { MkAsUi },
		setup: () => ({ args }),
		template: '<MkAsUi v-bind="args" />',
	}),
	args: {
		component: { id: 'text', type: 'text', text: 'AiScript から描かれたテキスト' },
		components: [ref({ id: 'text', type: 'text', text: 'AiScript から描かれたテキスト' })],
	},
} satisfies StoryObj<typeof MkAsUi>;
