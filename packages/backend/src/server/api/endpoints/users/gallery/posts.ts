/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersGalleryPostsParamDef } from '@/server/rest/gallery.js';

export const meta = {
	tags: ['users', 'gallery'],

	description: 'Show all gallery posts by the given user.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'GalleryPost',
		},
	},
} as const;

export const paramDef = usersGalleryPostsParamDef;
