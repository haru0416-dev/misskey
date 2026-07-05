/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// TODO: UserWebhook schemaの適用
export const meta = {
	tags: ['webhooks', 'account'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'array',
		items: {
			type: 'object',
			ref: 'UserWebhook',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;
