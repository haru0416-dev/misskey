/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { birthdaySchema, descriptionSchema, followedMessageSchema, locationSchema, nameSchema } from '@/models/User.js';
import { langmap } from '@/misc/langmap.js';
import { notificationRecieveConfig } from '@/models/json-schema/user.js';

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

const muteWords = { type: 'array', items: { oneOf: [
	{ type: 'array', items: { type: 'string' } },
	{ type: 'string' },
] } } as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { ...nameSchema, nullable: true },
		description: { ...descriptionSchema, nullable: true },
		followedMessage: { ...followedMessageSchema, nullable: true },
		location: { ...locationSchema, nullable: true },
		birthday: { ...birthdaySchema, nullable: true },
		lang: { type: 'string', enum: [null, ...Object.keys(langmap)] as string[], nullable: true },
		avatarId: { type: 'string', format: 'misskey:id', nullable: true },
		avatarDecorations: { type: 'array', maxItems: 16, items: {
			type: 'object',
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				angle: { type: 'number', nullable: true, maximum: 0.5, minimum: -0.5 },
				flipH: { type: 'boolean', nullable: true },
				offsetX: { type: 'number', nullable: true, maximum: 0.25, minimum: -0.25 },
				offsetY: { type: 'number', nullable: true, maximum: 0.25, minimum: -0.25 },
			},
			required: ['id'],
		} },
		bannerId: { type: 'string', format: 'misskey:id', nullable: true },
		fields: {
			type: 'array',
			minItems: 0,
			maxItems: 16,
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					value: { type: 'string' },
				},
				required: ['name', 'value'],
			},
		},
		isLocked: { type: 'boolean' },
		isExplorable: { type: 'boolean' },
		hideOnlineStatus: { type: 'boolean' },
		publicReactions: { type: 'boolean' },
		carefulBot: { type: 'boolean' },
		autoAcceptFollowed: { type: 'boolean' },
		noCrawle: { type: 'boolean' },
		preventAiLearning: { type: 'boolean' },
		requireSigninToViewContents: { type: 'boolean' },
		makeNotesFollowersOnlyBefore: { type: 'integer', nullable: true },
		makeNotesHiddenBefore: { type: 'integer', nullable: true },
		isBot: { type: 'boolean' },
		isCat: { type: 'boolean' },
		injectFeaturedNote: { type: 'boolean' },
		receiveAnnouncementEmail: { type: 'boolean' },
		alwaysMarkNsfw: { type: 'boolean' },
		autoSensitive: { type: 'boolean' },
		followingVisibility: { type: 'string', enum: ['public', 'followers', 'private'] },
		followersVisibility: { type: 'string', enum: ['public', 'followers', 'private'] },
		chatScope: { type: 'string', enum: ['everyone', 'followers', 'following', 'mutual', 'none'] },
		pinnedPageId: { type: 'string', format: 'misskey:id', nullable: true },
		mutedWords: muteWords,
		hardMutedWords: muteWords,
		mutedInstances: { type: 'array', items: {
			type: 'string',
		} },
		notificationRecieveConfig: {
			type: 'object',
			nullable: false,
			properties: {
				note: notificationRecieveConfig,
				follow: notificationRecieveConfig,
				mention: notificationRecieveConfig,
				reply: notificationRecieveConfig,
				renote: notificationRecieveConfig,
				quote: notificationRecieveConfig,
				reaction: notificationRecieveConfig,
				pollEnded: notificationRecieveConfig,
				scheduledNotePosted: notificationRecieveConfig,
				scheduledNotePostFailed: notificationRecieveConfig,
				receiveFollowRequest: notificationRecieveConfig,
				followRequestAccepted: notificationRecieveConfig,
				roleAssigned: notificationRecieveConfig,
				chatRoomInvitationReceived: notificationRecieveConfig,
				achievementEarned: notificationRecieveConfig,
				app: notificationRecieveConfig,
				test: notificationRecieveConfig,
			},
		},
		emailNotificationTypes: { type: 'array', items: {
			type: 'string',
		} },
		alsoKnownAs: {
			type: 'array',
			maxItems: 10,
			uniqueItems: true,
			items: { type: 'string' },
		},
	},
} as const;
