/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { galleryPostsPostIdParamDef } from '@/server/rest/gallery.js';

export const meta = {
	tags: ['gallery'],

	requireCredential: true,

	kind: 'write:gallery',

	errors: {
		noSuchPost: {
			message: 'No such post.',
			code: 'NO_SUCH_POST',
			id: 'ae52f367-4bd7-4ecd-afc6-5672fff427f5',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'c86e09de-1c48-43ac-a435-1c7e42ed4496',
		},
	},
} as const;

export const paramDef = galleryPostsPostIdParamDef;
