/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { action } from '@/stories/action.js';
import { HttpResponse, http } from 'msw';
import { userDetailed } from '@/stories/fakes.js';
import { commonHandlers } from '@/stories/mocks.js';
import MkAbuseReportWindow from './MkAbuseReportWindow.vue';
import type { StoryObj } from '@/stories/types.js';
export const Default = {
	render(args) {
		return {
			components: {
				MkAbuseReportWindow,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
				events() {
					return {
						closed: action('closed'),
					};
				},
			},
			template: '<MkAbuseReportWindow v-bind="props" v-on="events" />',
		};
	},
	args: {
		user: userDetailed(),
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/users/report-abuse', async ({ request }) => {
					action('POST /api/users/report-abuse')(await request.json());
					return HttpResponse.json({});
				}),
			],
		},
	},
} satisfies StoryObj<typeof MkAbuseReportWindow>;
