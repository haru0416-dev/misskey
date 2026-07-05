/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Show the properties of a user.',

	res: {
		optional: false, nullable: false,
		oneOf: [
			{
				type: 'object',
				ref: 'UserDetailed',
			},
			{
				type: 'array',
				items: {
					type: 'object',
					ref: 'UserDetailed',
				},
			},
		],
	},

	errors: {
		failedToResolveRemoteUser: {
			message: 'Failed to resolve remote user.',
			code: 'FAILED_TO_RESOLVE_REMOTE_USER',
			id: 'ef7b9be4-9cba-4e6f-ab41-90ed171c7d3c',
			kind: 'server',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '4362f8dc-731f-4ad8-a694-be5a88922a24',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						userId: { type: 'string', format: 'misskey:id' },
					},
					required: ['userId'],
				},
				{
					type: 'object',
					properties: {
						userIds: { type: 'array', uniqueItems: true, items: {
							type: 'string', format: 'misskey:id',
						} },
					},
					required: ['userIds'],
				},
				{
					type: 'object',
					properties: {
						username: { type: 'string' },
					},
					required: ['username'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				host: {
					type: 'string',
					nullable: true,
					description: 'The local host is represented with `null`.',
				},
			},
		},
	],
} as const;
