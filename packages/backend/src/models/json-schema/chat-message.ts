/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { chatRecordHeaderProperties } from '@/models/json-schema/chat-room.js';

const chatMessageHeaderProperties = {
	...chatRecordHeaderProperties,
	fromUserId: {
		type: 'string',
		optional: false,
		nullable: false,
	},
} as const;

// 4 種の表現で同じ意味を持つ本文と添付。
const chatMessageContentProperties = {
	text: {
		type: 'string',
		optional: true,
		nullable: true,
	},
	fileId: {
		type: 'string',
		optional: true,
		nullable: true,
	},
	file: {
		type: 'object',
		optional: true,
		nullable: true,
		ref: 'DriveFile',
	},
} as const;

// リアクションした利用者を必ず添える表現 (完全版とルーム向け) の reactions。
const reactionsWithUserProperty = {
	type: 'array',
	optional: false,
	nullable: false,
	items: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			reaction: {
				type: 'string',
				optional: false,
				nullable: false,
			},
			user: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'UserLite',
			},
		},
	},
} as const;

export const packedChatMessageSchema = {
	type: 'object',
	properties: {
		...chatMessageHeaderProperties,
		fromUser: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true,
			nullable: true,
		},
		toUser: {
			type: 'object',
			optional: true,
			nullable: true,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: true,
			nullable: true,
		},
		toRoom: {
			type: 'object',
			optional: true,
			nullable: true,
			ref: 'ChatRoom',
		},
		...chatMessageContentProperties,
		isRead: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
		reactions: reactionsWithUserProperty,
	},
} as const;

export const packedChatMessageLiteSchema = {
	type: 'object',
	properties: {
		...chatMessageHeaderProperties,
		fromUser: {
			type: 'object',
			optional: true,
			nullable: false,
			ref: 'UserLite',
		},
		toUserId: {
			type: 'string',
			optional: true,
			nullable: true,
		},
		toRoomId: {
			type: 'string',
			optional: true,
			nullable: true,
		},
		...chatMessageContentProperties,
		reactions: {
			type: 'array',
			optional: false,
			nullable: false,
			items: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					user: {
						type: 'object',
						optional: true,
						nullable: true,
						ref: 'UserLite',
					},
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteFor1on1Schema = {
	type: 'object',
	properties: {
		...chatMessageHeaderProperties,
		toUserId: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		...chatMessageContentProperties,
		reactions: {
			type: 'array',
			optional: false,
			nullable: false,
			items: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					reaction: {
						type: 'string',
						optional: false,
						nullable: false,
					},
				},
			},
		},
	},
} as const;

export const packedChatMessageLiteForRoomSchema = {
	type: 'object',
	properties: {
		...chatMessageHeaderProperties,
		fromUser: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'UserLite',
		},
		toRoomId: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		...chatMessageContentProperties,
		reactions: reactionsWithUserProperty,
	},
} as const;
