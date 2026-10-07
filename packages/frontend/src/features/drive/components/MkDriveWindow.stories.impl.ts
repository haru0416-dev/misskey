/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDriveWindow from './MkDriveWindow.vue';
import { http, HttpResponse } from 'msw';

export const Default = {
	render: (args) => ({
		components: { MkDriveWindow },
		setup: () => ({ args }),
		template: '<MkDriveWindow v-bind="args" />',
	}),
	args: {},
	parameters: {
		msw: {
			handlers: [
				http.post('/api/drive/folders', () => HttpResponse.json([])),
				http.post('/api/drive/files', () => HttpResponse.json([])),
			],
		},
	},
} satisfies StoryObj<typeof MkDriveWindow>;
