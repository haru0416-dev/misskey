/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminGetUserIpsParamDef } from '@/server/rest/admin-user-ips.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:user-ips',
	res: {
		type: 'array',
		optional: false,
		nullable: false,
		items: {
			type: 'object',
			optional: false,
			nullable: false,
			properties: {
				ip: { type: 'string' },
				createdAt: {
					type: 'string',
					optional: false,
					nullable: false,
					format: 'date-time',
				},
			},
		},
	},
} as const;

export const paramDef = adminGetUserIpsParamDef;
