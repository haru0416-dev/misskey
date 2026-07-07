/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { galleryPostsPostIdParamDef } from '@/server/rest/gallery.js';

export const meta = {
	tags: ['gallery'],

	requireCredential: false,

	errors: {
		noSuchPost: {
			message: 'No such post.',
			code: 'NO_SUCH_POST',
			id: '1137bf14-c5b0-4604-85bb-5b5371b1cd45',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'GalleryPost',
	},
} as const;

export const paramDef = galleryPostsPostIdParamDef;
