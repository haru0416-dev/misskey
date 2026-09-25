/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { chatRecordHeaderProperties } from '@/models/json-schema/chat-room.js';

export const packedChatRoomInvitationSchema = {
	type: 'object',
	properties: {
		...chatRecordHeaderProperties,
		userId: {
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
		roomId: {
			type: 'string',
			optional: false,
			nullable: false,
		},
		room: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'ChatRoom',
		},
	},
} as const;
