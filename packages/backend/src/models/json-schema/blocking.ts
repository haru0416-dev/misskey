/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedBlockingSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		blockeeId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
		blockee: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'UserDetailedNotMe',
		},
	},
} as const;
