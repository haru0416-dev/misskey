/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { chatRoomsInvitationsOutboxParamDef } from '@/server/rest/chat.js';

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
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a3c6b309-9717-4316-ae94-a69b53437237',
		},
	},
} as const;

export const paramDef = chatRoomsInvitationsOutboxParamDef;
