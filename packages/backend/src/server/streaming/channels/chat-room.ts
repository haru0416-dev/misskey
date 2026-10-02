/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchChatRoomByIdFromDatabase } from '@/core/chat/chat-room-store.js';
import type { JsonValue } from '@/misc/json-value.js';
import { hasPermissionToViewRoomTimeline, readRoomChatMessage } from '@/server/rest/chat/chat.js';
import type { ChatDependencies } from '@/core/chat/chat-packing.js';
import type { StreamChannelDefinition } from '../channel.js';

export const honoStreamChannelChatRoom: StreamChannelDefinition<ChatDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:chat',
	init: async (deps, ctx, params) => {
		if (typeof params['roomId'] !== 'string') {
			return false;
		}
		if (!ctx.user) {
			return false;
		}

		const user = ctx.user;
		const roomId = params['roomId'];

		const room = await fetchChatRoomByIdFromDatabase(deps.db, roomId);
		if (room == null) {
			return false;
		}
		if (!(await hasPermissionToViewRoomTimeline(deps, user, room))) {
			return false;
		}

		const handler = (data: { type: string; body: JsonValue }) => {
			ctx.send(data.type, data.body);
		};

		ctx.subscriber.on(`chatRoomStream:${roomId}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`chatRoomStream:${roomId}`, handler);
			},
			onMessage: (type) => {
				if (type === 'read') {
					void readRoomChatMessage(deps, user.id, roomId);
				}
			},
		};
	},
};
