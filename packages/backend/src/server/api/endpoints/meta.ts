/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	res: {
		type: 'object',
		oneOf: [
			{ type: 'object', ref: 'MetaLite' },
			{ type: 'object', ref: 'MetaDetailed' },
		],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		detail: { type: 'boolean', default: true },
	},
	required: [],
} as const;
