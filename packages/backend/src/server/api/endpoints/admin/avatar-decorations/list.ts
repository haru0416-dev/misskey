/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminAvatarDecorationsListParamDef } from '@/server/rest/admin-avatar-decorations.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageAvatarDecorations',
	kind: 'read:admin:avatar-decorations',

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
				name: {
					type: 'string',
					optional: false, nullable: false,
				},
				description: {
					type: 'string',
					optional: false, nullable: false,
				},
				url: {
					type: 'string',
					optional: false, nullable: false,
				},
				roleIdsThatCanBeUsedThisDecoration: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
				},
				category: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;

export const paramDef = adminAvatarDecorationsListParamDef;
