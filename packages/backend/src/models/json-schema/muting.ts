/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedMutingSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		expiresAt: {
			type: 'string',
			optional: false,
			nullable: true,
			format: 'date-time',
		},
		muteeId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
		mutee: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'UserDetailedNotMe',
		},
	},
} as const;
