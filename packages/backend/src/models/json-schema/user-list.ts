/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedUserListSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		name: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		userIds: {
			type: 'array',
			nullable: false,
			optional: true,
			items: {
				type: 'string',
				nullable: false,
				optional: false,
				format: 'id',
			},
		},
		isPublic: {
			type: 'boolean',
			nullable: false,
			optional: false,
		},
	},
} as const;
