/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { systemWebhookEventTypes } from '@/models/SystemWebhook.js';

export const meta = {
	tags: ['webhooks'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin:system-webhook',

	limit: {
		duration: ms('15min'),
		max: 60,
	},

	errors: {
		noSuchWebhook: {
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: '0c52149c-e913-18f8-5dc7-74870bfe0cf9',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		webhookId: {
			type: 'string',
			format: 'misskey:id',
		},
		type: {
			type: 'string',
			enum: systemWebhookEventTypes,
		},
		override: {
			type: 'object',
			properties: {
				url: { type: 'string', nullable: false },
				secret: { type: 'string', nullable: false },
			},
		},
	},
	required: ['webhookId', 'type'],
} as const;
