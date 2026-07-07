/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminSystemWebhookListParamDef } from '@/server/rest/admin-system-webhooks.js';

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

export const paramDef = adminSystemWebhookListParamDef;
