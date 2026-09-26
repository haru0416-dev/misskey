/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	adminSystemWebhookCreateParamDef,
	adminSystemWebhookDeleteParamDef,
	adminSystemWebhookListParamDef,
	adminSystemWebhookShowParamDef,
	adminSystemWebhookTestParamDef,
	adminSystemWebhookUpdateParamDef,
} from '@/server/rest/admin/admin-system-webhooks.js';
import { MINUTE } from '@/const.js';
import { defineContract } from '@/server/rest/endpoint-contract.js';

export const endpointMetas = {
	'admin/system-webhook/create': defineContract({
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
		},
		paramDef: adminSystemWebhookCreateParamDef,
	}),
	'admin/system-webhook/delete': defineContract({
		meta: {
			tags: ['admin', 'system-webhook'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'write:admin:system-webhook',
		},
		paramDef: adminSystemWebhookDeleteParamDef,
	}),
	'admin/system-webhook/list': defineContract({
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
		},
		paramDef: adminSystemWebhookListParamDef,
	}),
	'admin/system-webhook/show': defineContract({
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
		},
		paramDef: adminSystemWebhookShowParamDef,
	}),
	'admin/system-webhook/test': defineContract({
		meta: {
			tags: ['webhooks'],

			requireCredential: true,
			requireModerator: true,
			secure: true,
			kind: 'read:admin:system-webhook',

			// 外部 URL への HTTP 配送をキューに積むので、無制限だと増幅送信の踏み台になる。
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
		},
		paramDef: adminSystemWebhookTestParamDef,
	}),
	'admin/system-webhook/update': defineContract({
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
		},
		paramDef: adminSystemWebhookUpdateParamDef,
	}),
};
