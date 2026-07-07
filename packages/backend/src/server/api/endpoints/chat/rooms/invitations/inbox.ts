/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { chatRoomsInvitationsInboxParamDef } from '@/server/rest/chat.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatRoomInvitation',
		},
	},

	errors: {
	},
} as const;

export const paramDef = chatRoomsInvitationsInboxParamDef;
