/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// chat 系の行は id に format を付けずに公開している。
export const chatRecordHeaderProperties = {
	id: {
		type: 'string',
		optional: false,
		nullable: false,
	},
	createdAt: {
		type: 'string',
		format: 'date-time',
		optional: false,
		nullable: false,
	},
} as const;

export const packedChatRoomSchema = {
	type: 'object',
	properties: {
		...chatRecordHeaderProperties,
		ownerId: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		owner: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		description: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
		invitationExists: {
			type: 'boolean',
			optional: true,
			nullable: false,
		},
	},
} as const;
