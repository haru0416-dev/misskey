/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { userExportableEntities } from '@/types.js';
import type { notificationTypes } from '@/types.js';

const baseProperties = {
	id: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'id',
	},
	createdAt: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'date-time',
	},
} as const;

const notifierProperties = {
	user: {
		type: 'object',
		ref: 'UserLite',
		optional: false,
		nullable: false,
	},
	userId: {
		type: 'string',
		optional: false,
		nullable: false,
		format: 'id',
	},
} as const;

const notificationNoteProperty = {
	type: 'object',
	ref: 'Note',
	optional: false,
	nullable: false,
} as const;

const notifierNoteProperties = {
	...notifierProperties,
	note: notificationNoteProperty,
} as const;

type NotificationType = (typeof notificationTypes)[number] | 'reaction:grouped' | 'renote:grouped';

// oneOf の各要素は type の値 1 つで判別する。
function notificationVariant<const T extends NotificationType, const P extends object>(type: T, properties: P) {
	return {
		type: 'object',
		properties: {
			...baseProperties,
			type: {
				type: 'string',
				optional: false,
				nullable: false,
				enum: [type],
			},
			...properties,
		},
	} as const;
}

export const packedNotificationSchema = {
	type: 'object',
	oneOf: [
		notificationVariant('note', notifierNoteProperties),
		notificationVariant('mention', notifierNoteProperties),
		notificationVariant('reply', notifierNoteProperties),
		notificationVariant('renote', notifierNoteProperties),
		notificationVariant('quote', notifierNoteProperties),
		notificationVariant('reaction', {
			...notifierNoteProperties,
			reaction: {
				type: 'string',
				optional: false,
				nullable: false,
			},
		}),
		notificationVariant('pollEnded', notifierNoteProperties),
		notificationVariant('scheduledNotePosted', {
			note: notificationNoteProperty,
		}),
		notificationVariant('scheduledNotePostFailed', {
			noteDraft: {
				type: 'object',
				ref: 'NoteDraft',
				optional: false,
				nullable: false,
			},
		}),
		notificationVariant('follow', notifierProperties),
		notificationVariant('receiveFollowRequest', notifierProperties),
		notificationVariant('followRequestAccepted', {
			...notifierProperties,
			message: {
				type: 'string',
				optional: false,
				nullable: true,
			},
		}),
		notificationVariant('roleAssigned', {
			role: {
				type: 'object',
				ref: 'Role',
				optional: false,
				nullable: false,
			},
		}),
		notificationVariant('chatRoomInvitationReceived', {
			invitation: {
				type: 'object',
				ref: 'ChatRoomInvitation',
				optional: false,
				nullable: false,
			},
		}),
		notificationVariant('achievementEarned', {
			achievement: {
				ref: 'AchievementName',
			},
		}),
		notificationVariant('exportCompleted', {
			exportedEntity: {
				type: 'string',
				optional: false,
				nullable: false,
				enum: userExportableEntities,
			},
			fileId: {
				type: 'string',
				optional: false,
				nullable: false,
				format: 'id',
			},
		}),
		notificationVariant('login', {}),
		notificationVariant('createToken', {}),
		notificationVariant('app', {
			body: {
				type: 'string',
				optional: false,
				nullable: false,
			},
			header: {
				type: 'string',
				optional: false,
				nullable: true,
			},
			icon: {
				type: 'string',
				optional: false,
				nullable: true,
			},
		}),
		notificationVariant('reaction:grouped', {
			note: notificationNoteProperty,
			reactions: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					properties: {
						user: {
							type: 'object',
							ref: 'UserLite',
							optional: false,
							nullable: false,
						},
						reaction: {
							type: 'string',
							optional: false,
							nullable: false,
						},
					},
					required: ['user', 'reaction'],
				},
			},
		}),
		notificationVariant('renote:grouped', {
			note: notificationNoteProperty,
			users: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					ref: 'UserLite',
					optional: false,
					nullable: false,
				},
			},
		}),
		notificationVariant('test', {}),
	],
} as const;
