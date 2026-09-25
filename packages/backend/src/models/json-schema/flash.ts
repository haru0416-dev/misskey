/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { editableUserContentHeaderProperties } from '@/models/json-schema/common.js';

export const packedFlashSchema = {
	type: 'object',
	properties: {
		...editableUserContentHeaderProperties,
		title: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		summary: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		script: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		visibility: {
			type: 'string',
			optional: false,
			nullable: false,
			enum: ['private', 'public'],
		},
		likedCount: {
			type: 'number',
			optional: false,
			nullable: false,
		},
		isLiked: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
	},
} as const;
