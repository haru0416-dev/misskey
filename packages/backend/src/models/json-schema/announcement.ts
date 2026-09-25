/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entityHeaderProperties } from '@/models/json-schema/common.js';

export const packedAnnouncementSchema = {
	type: 'object',
	properties: {
		...entityHeaderProperties,
		updatedAt: {
			type: 'string',
			optional: false,
			nullable: true,
			format: 'date-time',
		},
		text: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		title: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		imageUrl: {
			type: 'string',
			optional: false,
			nullable: true,
		},
		icon: {
			type: 'string',
			optional: false,
			nullable: false,
			enum: ['info', 'warning', 'error', 'success'],
		},
		display: {
			type: 'string',
			optional: false,
			nullable: false,
			enum: ['dialog', 'normal', 'banner'],
		},
		needConfirmationToRead: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		silence: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		isActive: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		forYou: {
			type: 'boolean',
			optional: false,
			nullable: false,
		},
		isRead: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
		reactions: {
			type: 'object',
			optional: false,
			nullable: false,
			additionalProperties: {
				anyOf: [
					{
						type: 'number',
					},
				],
			},
		},
		myReaction: {
			type: 'string',
			optional: true,
			nullable: true,
		},
	},
} as const;
