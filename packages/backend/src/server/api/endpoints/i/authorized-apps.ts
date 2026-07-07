/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { iAuthorizedAppsParamDef } from '@/server/rest/app.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					format: 'misskey:id',
					optional: false,
				},
				name: {
					type: 'string',
					optional: false,
				},
				callbackUrl: {
					type: 'string',
					optional: false, nullable: true,
				},
				permission: {
					type: 'array',
					optional: false,
					uniqueItems: true,
					items: {
						type: 'string',
					},
				},
				isAuthorized: {
					type: 'boolean',
					optional: true,
				},
			},
		},
	},
} as const;

export const paramDef = iAuthorizedAppsParamDef;
