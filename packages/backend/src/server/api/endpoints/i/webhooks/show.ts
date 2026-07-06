/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { webhooksShowParamDef } from '@/server/rest/webhooks.js';

// TODO: UserWebhook schemaの適用
export const meta = {
	tags: ['webhooks'],

	requireCredential: true,

	kind: 'read:account',

	errors: {
		noSuchWebhook: {
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: '50f614d9-3047-4f7e-90d8-ad6b2d5fb098',
		},
	},

	res: {
		type: 'object',
		ref: 'UserWebhook',
	},
} as const;

export const paramDef = webhooksShowParamDef;
