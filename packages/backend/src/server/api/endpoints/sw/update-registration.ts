/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { swUpdateRegistrationParamDef } from '@/server/rest/sw.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	description: 'Update push notification registration.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			userId: {
				type: 'string',
				optional: false, nullable: false,
			},
			endpoint: {
				type: 'string',
				optional: false, nullable: false,
			},
			sendReadMessage: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
	errors: {
		noSuchRegistration: {
			message: 'No such registration.',
			code: 'NO_SUCH_REGISTRATION',
			id: ' b09d8066-8064-5613-efb6-0e963b21d012',
		},
	},
} as const;

export const paramDef = swUpdateRegistrationParamDef;
