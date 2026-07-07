/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { announcementShowParamDef } from '@/server/rest/announcements.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Announcement',
	},

	errors: {
		noSuchAnnouncement: {
			message: 'No such announcement.',
			code: 'NO_SUCH_ANNOUNCEMENT',
			id: 'b57b5e1d-4f49-404a-9edb-46b00268f121',
		},
	},
} as const;

export const paramDef = announcementShowParamDef;
