/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				scopes: {
					type: 'array',
					items: {
						type: 'array',
						items: {
							type: 'string',
						}
					}
				},
				domain: {
					type: 'string',
					nullable: true,
				},
			},
		},
	}
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;
