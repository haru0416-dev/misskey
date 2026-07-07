/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminShowModerationLogsParamDef } from '@/server/rest/moderation-log.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:show-moderation-log',

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
				createdAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				type: {
					type: 'string',
					optional: false, nullable: false,
				},
				info: {
					type: 'object',
					optional: false, nullable: false,
				},
				userId: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				user: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserDetailedNotMe',
				},
			},
		},
	},
} as const;

export const paramDef = adminShowModerationLogsParamDef;
