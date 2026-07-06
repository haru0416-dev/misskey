/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAnnouncementsListParamDef } from '@/server/rest/admin-announcements.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:announcements',

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
					example: 'xxxxxxxxxx',
				},
				createdAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				updatedAt: {
					type: 'string',
					optional: false, nullable: true,
					format: 'date-time',
				},
				text: {
					type: 'string',
					optional: false, nullable: false,
				},
				title: {
					type: 'string',
					optional: false, nullable: false,
				},
				icon: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['info', 'warning', 'error', 'success'],
				},
				display: {
					type: 'string',
					optional: false, nullable: false,
					enum: ['normal', 'banner', 'dialog'],
				},
				isActive: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				forExistingUsers: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				silence: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				needConfirmationToRead: {
					type: 'boolean',
					optional: false, nullable: false,
				},
				userId: {
					type: 'string',
					optional: false, nullable: true,
				},
				imageUrl: {
					type: 'string',
					optional: false, nullable: true,
				},
				reads: {
					type: 'number',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = adminAnnouncementsListParamDef;
