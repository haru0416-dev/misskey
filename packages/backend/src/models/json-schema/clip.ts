/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { authorProperties, entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedClipSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		lastClippedAt: {
			type: 'string',
			optional: false,
			nullable: true,
			format: 'date-time',
		},
		...authorProperties,
		name: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		description: {
			type: 'string',
			optional: false,
			nullable: true,
		},
		isPublic: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		favoritedCount: {
			type: 'number',
			optional: false,
			nullable: false,
		},
		isFavorited: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
		notesCount: {
			type: 'integer',
			optional: true,
			nullable: false,
		},
	},
} as const;
