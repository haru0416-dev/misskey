/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { flashMyLikesParamDef } from '@/server/rest/flash.js';

export const meta = {
	tags: ['account', 'flash'],

	requireCredential: true,

	kind: 'read:flash-likes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				flash: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Flash',
				},
			},
		},
	},
} as const;

export const paramDef = flashMyLikesParamDef;
