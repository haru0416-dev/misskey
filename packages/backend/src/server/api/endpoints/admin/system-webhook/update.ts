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
		type: 'object',
		ref: 'SystemWebhook',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			format: 'misskey:id',
		},
		isActive: {
			type: 'boolean',
		},
		name: {
			type: 'string',
			minLength: 1,
			maxLength: 255,
		},
		on: {
			type: 'array',
			items: {
				type: 'string',
				enum: systemWebhookEventTypes,
			},
		},
		url: {
			type: 'string',
			minLength: 1,
			maxLength: 1024,
		},
		secret: {
			type: 'string',
			maxLength: 1024,
			default: '',
		},
	},
	required: [
		'id',
		'isActive',
		'name',
		'on',
		'url',
	],
} as const;
