/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { usersRelationParamDef } from '@/server/rest/user.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Show the different kinds of relations between the authenticated user and the specified user(s).',

	res: {
		optional: false, nullable: false,
		oneOf: [
			{
				type: 'object',
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
					isFollowing: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					hasPendingFollowRequestFromYou: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					hasPendingFollowRequestToYou: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isFollowed: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isBlocking: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isBlocked: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isMuted: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isRenoteMuted: {
						type: 'boolean',
						optional: false, nullable: false,
					},
				},
			},
			{
				type: 'array',
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						isFollowing: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						hasPendingFollowRequestFromYou: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						hasPendingFollowRequestToYou: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isFollowed: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isBlocking: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isBlocked: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isMuted: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isRenoteMuted: {
							type: 'boolean',
							optional: false, nullable: false,
						},
					},
				},
			},
		],
	},
} as const;

export const paramDef = usersRelationParamDef;
