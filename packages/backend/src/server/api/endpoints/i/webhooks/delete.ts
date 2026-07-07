/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { webhooksDeleteParamDef } from '@/server/rest/webhooks.js';

export const meta = {
	tags: ['webhooks'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchWebhook: {
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'bae73e5a-5522-4965-ae19-3a8688e71d82',
		},
	},
} as const;

export const paramDef = webhooksDeleteParamDef;

// TODO: ロジックをサービスに切り出す
