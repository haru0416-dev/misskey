/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedFollowingSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		followeeId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
		followerId: {
			type: 'string',
			optional: false,
			nullable: false,
			format: 'id',
		},
		followee: {
			type: 'object',
			optional: true,
			nullable: false,
			ref: 'UserDetailedNotMe',
		},
		follower: {
			type: 'object',
			optional: true,
			nullable: false,
			ref: 'UserDetailedNotMe',
		},
	},
} as const;
