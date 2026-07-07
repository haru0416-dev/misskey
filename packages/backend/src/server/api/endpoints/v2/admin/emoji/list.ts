/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchEmojisHostTypes, fetchEmojisSortKeys } from '@/core/custom-emoji-types.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'read:admin:emoji',

	res: {
		type: 'object',
		properties: {
			emojis: {
				type: 'array',
				items: {
					type: 'object',
					ref: 'EmojiDetailedAdmin',
				},
			},
			count: { type: 'integer' },
			allCount: { type: 'integer' },
			allPages: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: {
			type: 'object',
			nullable: true,
			properties: {
				updatedAtFrom: { type: 'string' },
				updatedAtTo: { type: 'string' },
				name: { type: 'string' },
				host: { type: 'string' },
				uri: { type: 'string' },
				publicUrl: { type: 'string' },
				originalUrl: { type: 'string' },
				type: { type: 'string' },
				aliases: { type: 'string' },
				category: { type: 'string' },
				license: { type: 'string' },
				isSensitive: { type: 'boolean' },
				localOnly: { type: 'boolean' },
				hostType: {
					type: 'string',
					enum: fetchEmojisHostTypes,
					default: 'all',
				},
				roleIds: {
					type: 'array',
					items: { type: 'string', format: 'misskey:id' },
				},
			},
		},
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		page: { type: 'integer' },
		sortKeys: {
			type: 'array',
			default: ['-id'],
			items: {
				type: 'string',
				enum: fetchEmojisSortKeys,
			},
		},
	},
	required: [],
} as const;
