/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i2faKeyDoneParamDef } from '@/server/rest/i-2fa.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0',
		},

		twoFactorNotEnabled: {
			message: '2fa not enabled.',
			code: 'TWO_FACTOR_NOT_ENABLED',
			id: '798d6847-b1ed-4f9c-b1f9-163c42655995',
		},
	},

	res: {
		type: 'object',
		nullable: false,
		optional: false,
		properties: {
			id: { type: 'string' },
			name: { type: 'string' },
		},
	},
} as const;

export const paramDef = i2faKeyDoneParamDef;

// eslint-disable-next-line import/no-default-export
