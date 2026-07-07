/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAbuseUserReportsParamDef } from '@/server/rest/admin-abuse-reports.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:abuse-user-reports',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					nullable: false, optional: false,
					format: 'id',
					example: 'xxxxxxxxxx',
				},
				createdAt: {
					type: 'string',
					nullable: false, optional: false,
					format: 'date-time',
				},
				comment: {
					type: 'string',
					nullable: false, optional: false,
				},
				resolved: {
					type: 'boolean',
					nullable: false, optional: false,
					example: false,
				},
				reporterId: {
					type: 'string',
					nullable: false, optional: false,
					format: 'id',
				},
				targetUserId: {
					type: 'string',
					nullable: false, optional: false,
					format: 'id',
				},
				assigneeId: {
					type: 'string',
					nullable: true, optional: false,
					format: 'id',
				},
				reporter: {
					type: 'object',
					nullable: false, optional: false,
					ref: 'UserDetailedNotMe',
				},
				targetUser: {
					type: 'object',
					nullable: false, optional: false,
					ref: 'UserDetailedNotMe',
				},
				assignee: {
					type: 'object',
					nullable: true, optional: false,
					ref: 'UserDetailedNotMe',
				},
				forwarded: {
					type: 'boolean',
					nullable: false, optional: false,
				},
				resolvedAs: {
					type: 'string',
					nullable: true, optional: false,
					enum: ['accept', 'reject', null],
				},
				moderationNote: {
					type: 'string',
					nullable: false, optional: false,
				},
			},
		},
	},
} as const;

export const paramDef = adminAbuseUserReportsParamDef;
