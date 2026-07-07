/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { iUpdateParamDef } from '@/server/rest/account-update.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',

	limit: {
		duration: ms('1hour'),
		max: 20,
	},

	errors: {
		noSuchAvatar: {
			message: 'No such avatar file.',
			code: 'NO_SUCH_AVATAR',
			id: '539f3a45-f215-4f81-a9a8-31293640207f',
		},

		noSuchBanner: {
			message: 'No such banner file.',
			code: 'NO_SUCH_BANNER',
			id: '0d8f5629-f210-41c2-9433-735831a58595',
		},

		avatarNotAnImage: {
			message: 'The file specified as an avatar is not an image.',
			code: 'AVATAR_NOT_AN_IMAGE',
			id: 'f419f9f8-2f4d-46b1-9fb4-49d3a2fd7191',
		},

		bannerNotAnImage: {
			message: 'The file specified as a banner is not an image.',
			code: 'BANNER_NOT_AN_IMAGE',
			id: '75aedb19-2afd-4e6d-87fc-67941256fa60',
		},

		noSuchPage: {
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: '8e01b590-7eb9-431b-a239-860e086c408e',
		},

		invalidRegexp: {
			message: 'Invalid Regular Expression.',
			code: 'INVALID_REGEXP',
			id: '0d786918-10df-41cd-8f33-8dec7d9a89a5',
		},

		tooManyMutedWords: {
			message: 'Too many muted words.',
			code: 'TOO_MANY_MUTED_WORDS',
			id: '010665b1-a211-42d2-bc64-8f6609d79785',
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

		forbiddenToSetYourself: {
			message: 'You can\'t set yourself as your own alias.',
			code: 'FORBIDDEN_TO_SET_YOURSELF',
			id: '25c90186-4ab0-49c8-9bba-a1fa6c202ba4',
		},

		restrictedByRole: {
			message: 'This feature is restricted by your role.',
			code: 'RESTRICTED_BY_ROLE',
			id: '8feff0ba-5ab5-585b-31f4-4df816663fad',
		},

		nameContainsProhibitedWords: {
			message: 'Your new name contains prohibited words.',
			code: 'YOUR_NAME_CONTAINS_PROHIBITED_WORDS',
			id: '0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191',
			httpStatusCode: 422,
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'MeDetailed',
	},
} as const;

export const paramDef = iUpdateParamDef;
