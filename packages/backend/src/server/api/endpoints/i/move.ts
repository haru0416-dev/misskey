/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['users'],

	secure: true,
	requireCredential: true,
	prohibitMoved: true,
	limit: {
		duration: ms('1day'),
		max: 5,
	},

	errors: {
		destinationAccountForbids: {
			message:
				'Destination account doesn\'t have proper \'Known As\' alias, or has already moved.',
			code: 'DESTINATION_ACCOUNT_FORBIDS',
			id: 'b5c90186-4ab0-49c8-9bba-a1f766282ba4',
		},
		rootForbidden: {
			message: 'The root can\'t migrate.',
			code: 'NOT_ROOT_FORBIDDEN',
			id: '4362e8dc-731f-4ad8-a694-be2a88922a24',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
		},
		uriNull: {
			message: 'User ActivityPup URI is null.',
			code: 'URI_NULL',
			id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
		},
		localUriNull: {
			message: 'Local User ActivityPup URI is null.',
			code: 'URI_NULL',
			id: '95ba11b9-90e8-43a5-ba16-7acc1ab32e71',
		},
		alreadyMoved: {
			message: 'Account was already moved to another account.',
			code: 'ALREADY_MOVED',
			id: 'b234a14e-9ebe-4581-8000-074b3c215962',
		},
	},

	res: {
		type: 'object',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		moveToAccount: { type: 'string' },
	},
	required: ['moveToAccount'],
} as const;
