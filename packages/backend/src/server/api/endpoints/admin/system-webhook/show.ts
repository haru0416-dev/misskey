/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminSystemWebhookShowParamDef } from '@/server/rest/admin-system-webhooks.js';

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

	errors: {
		noSuchSystemWebhook: {
			message: 'No such SystemWebhook.',
			code: 'NO_SUCH_SYSTEM_WEBHOOK',
			id: '38dd1ffe-04b4-6ff5-d8ba-4e6a6ae22c9d',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = adminSystemWebhookShowParamDef;
