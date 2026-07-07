/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i2faRemoveKeyParamDef } from '@/server/rest/i-2fa.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '141c598d-a825-44c8-9173-cfb9d92be493',
		},
	},
} as const;

export const paramDef = i2faRemoveKeyParamDef;
