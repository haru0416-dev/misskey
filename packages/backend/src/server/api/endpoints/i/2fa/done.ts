/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i2faDoneParamDef } from '@/server/rest/i-2fa.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'object',
		properties: {
			backupCodes: {
				type: 'array',
				optional: false,
				items: {
					type: 'string',
				},
			},
		},
	},
} as const;

export const paramDef = i2faDoneParamDef;
