/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';
import MkDriveSelectDialog from './MkDriveFileSelectDialog.vue';
import { http, HttpResponse } from 'msw';

export const Default = {
	render: (args) => ({
		components: { MkDriveSelectDialog },
		setup: () => ({ args }),
		template: '<MkDriveSelectDialog v-bind="args" />',
	}),
	args: { multiple: false },
	parameters: {
		msw: {
			handlers: [
				http.post('/api/drive/folders', () => HttpResponse.json([])),
				http.post('/api/drive/files', () => HttpResponse.json([])),
			],
		},
	},
} satisfies StoryObj<typeof MkDriveSelectDialog>;
