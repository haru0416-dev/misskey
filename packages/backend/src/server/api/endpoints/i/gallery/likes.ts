/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { iGalleryLikesParamDef } from '@/server/rest/gallery.js';

export const meta = {
	tags: ['account', 'gallery'],

	requireCredential: true,

	kind: 'read:gallery-likes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				post: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'GalleryPost',
				},
			},
		},
	},
} as const;

export const paramDef = iGalleryLikesParamDef;
