/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { adminSystemWebhookCreateParamDef, adminSystemWebhookDeleteParamDef, adminSystemWebhookListParamDef, adminSystemWebhookShowParamDef, adminSystemWebhookTestParamDef, adminSystemWebhookUpdateParamDef } from '@/server/rest/admin-system-webhooks.js';
import { MINUTE } from '@/const.js';

export const endpointMetas = {
	'admin/system-webhook/create': {
		meta: {
			tags: ['admin', 'system-webhook'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:system-webhook',

			res: {
				type: 'object',
				ref: 'SystemWebhook',
			},
		} as const,
		paramDef: adminSystemWebhookCreateParamDef,
	},
	'admin/system-webhook/delete': {
		meta: {
			tags: ['admin', 'system-webhook'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:system-webhook',
		} as const,
		paramDef: adminSystemWebhookDeleteParamDef,
	},
	'admin/system-webhook/list': {
		meta: {
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
		} as const,
		paramDef: adminSystemWebhookListParamDef,
	},
	'admin/system-webhook/show': {
		meta: {
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
		} as const,
		paramDef: adminSystemWebhookShowParamDef,
	},
	'admin/system-webhook/test': {
		meta: {
			tags: ['webhooks'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'read:admin:system-webhook',

			limit: {
				duration: 15 * MINUTE,
				max: 60,
			},

			errors: {
				noSuchWebhook: {
					message: 'No such webhook.',
					code: 'NO_SUCH_WEBHOOK',
					id: '0c52149c-e913-18f8-5dc7-74870bfe0cf9',
				},
			},
		} as const,
		paramDef: adminSystemWebhookTestParamDef,
	},
	'admin/system-webhook/update': {
		meta: {
			tags: ['admin', 'system-webhook'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:system-webhook',

			res: {
				type: 'object',
				ref: 'SystemWebhook',
			},
		} as const,
		paramDef: adminSystemWebhookUpdateParamDef,
	},
} as const;
