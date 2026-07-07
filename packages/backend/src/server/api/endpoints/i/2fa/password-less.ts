/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i2faPasswordLessParamDef } from '@/server/rest/i-2fa.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		noKey: {
			message: 'No security key.',
			code: 'NO_SECURITY_KEY',
			id: 'f9c54d7f-d4c2-4d3c-9a8g-a70daac86512',
		},
	},
} as const;

export const paramDef = i2faPasswordLessParamDef;
