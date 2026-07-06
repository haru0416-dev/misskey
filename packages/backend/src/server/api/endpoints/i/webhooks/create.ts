/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { webhookEventTypes } from '@/models/Webhook.js';
import { webhooksCreateParamDef } from '@/server/rest/webhooks.js';

// TODO: UserWebhook schemaの適用
export const meta = {
	tags: ['webhooks'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		tooManyWebhooks: {
			message: 'You cannot create webhook any more.',
			code: 'TOO_MANY_WEBHOOKS',
			id: '87a9bb19-111e-4e37-81d3-a3e7426453b0',
		},
	},

	res: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				format: 'misskey:id',
			},
			userId: {
				type: 'string',
				format: 'misskey:id',
			},
			name: { type: 'string' },
			on: {
				type: 'array',
				items: {
					type: 'string',
					enum: webhookEventTypes,
				},
			},
			url: { type: 'string' },
			secret: { type: 'string' },
			active: { type: 'boolean' },
			latestSentAt: { type: 'string', format: 'date-time', nullable: true },
			latestStatus: { type: 'integer', nullable: true },
		},
	},
} as const;

export const paramDef = webhooksCreateParamDef;

// TODO: ロジックをサービスに切り出す
