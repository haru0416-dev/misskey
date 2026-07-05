/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { systemWebhookEventTypes } from '@/models/SystemWebhook.js';

export const meta = {
	tags: ['admin', 'system-webhook'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'write:admin:system-webhook',

	res: {
		type: 'array',
		items: {
			type: 'object',
			ref: 'SystemWebhook',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		isActive: {
			type: 'boolean',
		},
		on: {
			type: 'array',
			items: {
				type: 'string',
				enum: systemWebhookEventTypes,
			},
		},
	},
	required: [],
} as const;
