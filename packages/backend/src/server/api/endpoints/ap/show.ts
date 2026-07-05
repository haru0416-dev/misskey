/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';

export const meta = {
	tags: ['federation'],

	requireCredential: true,
	kind: 'read:account',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	errors: {
		federationNotAllowed: {
			message: 'Federation for this host is not allowed.',
			code: 'FEDERATION_NOT_ALLOWED',
			id: '974b799e-1a29-4889-b706-18d4dd93e266',
		},
		uriInvalid: {
			message: 'URI is invalid.',
			code: 'URI_INVALID',
			id: '1a5eab56-e47b-48c2-8d5e-217b897d70db',
		},
		requestFailed: {
			message: 'Request failed.',
			code: 'REQUEST_FAILED',
			id: '81b539cf-4f57-4b29-bc98-032c33c0792e',
		},
		responseInvalid: {
			message: 'Response from remote server is invalid.',
			code: 'RESPONSE_INVALID',
			id: '70193c39-54f3-4813-82f0-70a680f7495b',
		},
		noSuchObject: {
			message: 'No such object.',
			code: 'NO_SUCH_OBJECT',
			id: 'dc94d745-1262-4e63-a17d-fecaa57efc82',
		},
	},

	res: {
		optional: false, nullable: false,
		oneOf: [
			{
				type: 'object',
				properties: {
					type: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['User'],
					},
					object: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserDetailedNotMe',
					},
				},
			},
			{
				type: 'object',
				properties: {
					type: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['Note'],
					},
					object: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'Note',
					},
				},
			},
		],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		uri: { type: 'string' },
	},
	required: ['uri'],
} as const;
