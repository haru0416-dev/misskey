/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { channelCreateParamDef, channelFollowParamDef, channelMuteCreateParamDef, channelMuteDeleteParamDef, channelShowParamDef, channelUpdateParamDef, channelsListParamDef, channelsSearchParamDef, emptyParamDef } from '@/server/rest/channels.js';
import { channelParamDef } from '@/server/rest/favorites.js';
import { HOUR } from '@/const.js';

export const endpointMetas = {
	'channels/create': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:channels',

			requiredRolePolicy: 'canCreateChannel',

			limit: {
				duration: HOUR,
				max: 10,
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Channel',
			},

			errors: {
				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'cd1e9f3e-5a12-4ab4-96f6-5d0a2cc32050',
				},
			},
		} as const,
		paramDef: channelCreateParamDef,
	},
	'channels/favorite': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '4938f5f3-6167-4c04-9149-6607b7542861',
				},
			},
		} as const,
		paramDef: channelParamDef,
	},
	'channels/featured': {
		meta: {
			tags: ['channels'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: emptyParamDef,
	},
	'channels/follow': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'c0031718-d573-4e85-928e-10039f1fbb68',
				},
			},
		} as const,
		paramDef: channelFollowParamDef,
	},
	'channels/followed': {
		meta: {
			tags: ['channels', 'account'],

			requireCredential: true,

			kind: 'read:channels',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: channelsListParamDef,
	},
	'channels/my-favorites': {
		meta: {
			tags: ['channels', 'account'],

			requireCredential: true,

			kind: 'read:channels',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: emptyParamDef,
	},
	'channels/owned': {
		meta: {
			tags: ['channels', 'account'],

			requireCredential: true,

			kind: 'read:channels',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: channelsListParamDef,
	},
	'channels/search': {
		meta: {
			tags: ['channels'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: channelsSearchParamDef,
	},
	'channels/show': {
		meta: {
			tags: ['channels'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Channel',
			},

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '6f6c314b-7486-4897-8966-c04a66a02923',
				},
			},
		} as const,
		paramDef: channelShowParamDef,
	},
	'channels/timeline': {
		meta: {
			tags: ['notes', 'channels'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '4d0eeeba-a02c-4c3c-9966-ef60d38d2e7f',
				},
			},
		} as const,
		paramDef: {
			type: 'object',
			properties: {
				channelId: { type: 'string', format: 'misskey:id' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
				sinceId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				sinceDate: { type: 'integer' },
				untilDate: { type: 'integer' },
				allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
			},
			required: ['channelId'],
		} as const,
	},
	'channels/unfavorite': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '353c68dd-131a-476c-aa99-88a345e83668',
				},
			},
		} as const,
		paramDef: channelParamDef,
	},
	'channels/unfollow': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '19959ee9-0153-4c51-bbd9-a98c49dc59d6',
				},
			},
		} as const,
		paramDef: channelFollowParamDef,
	},
	'channels/update': {
		meta: {
			tags: ['channels'],

			requireCredential: true,

			kind: 'write:channels',

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Channel',
			},

			errors: {
				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'f9c5467f-d492-4c3c-9a8d-a70dacc86512',
				},

				accessDenied: {
					message: 'You do not have edit privilege of the channel.',
					code: 'ACCESS_DENIED',
					id: '1fb7cb09-d46a-4fdf-b8df-057788cce513',
				},

				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'e86c14a4-0da2-4032-8df3-e737a04c7f3b',
				},
			},
		} as const,
		paramDef: channelUpdateParamDef,
	},
	'channels/mute/create': {
		meta: {
			tags: ['channels', 'mute'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such Channel.',
					code: 'NO_SUCH_CHANNEL',
					id: '7174361e-d58f-31d6-2e7c-6fb830786a3f',
				},

				alreadyMuting: {
					message: 'You are already muting that user.',
					code: 'ALREADY_MUTING_CHANNEL',
					id: '5a251978-769a-da44-3e89-3931e43bb592',
				},

				expiresAtIsPast: {
					message: 'Cannot set past date to "expiresAt".',
					code: 'EXPIRES_AT_IS_PAST',
					id: '42b32236-df2c-a45f-fdbf-def67268f749',
				},
			},
		} as const,
		paramDef: channelMuteCreateParamDef,
	},
	'channels/mute/delete': {
		meta: {
			tags: ['channels', 'mute'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:channels',

			errors: {
				noSuchChannel: {
					message: 'No such Channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'e7998769-6e94-d9c2-6b8f-94a527314aba',
				},

				notMuting: {
					message: 'You are not muting that channel.',
					code: 'NOT_MUTING_CHANNEL',
					id: '14d55962-6ea8-d990-1333-d6bef78dc2ab',
				},
			},
		} as const,
		paramDef: channelMuteDeleteParamDef,
	},
	'channels/mute/list': {
		meta: {
			tags: ['channels', 'mute'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'read:channels',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
			},
		} as const,
		paramDef: emptyParamDef,
	},
} as const;
