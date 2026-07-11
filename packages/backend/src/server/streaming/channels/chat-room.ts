/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchChatRoomByIdFromDatabase } from '@/core/ChatRoomStore.js';
import type { JsonValue } from '@/misc/json-value.js';
import { hasPermissionToViewRoomTimelineForHonoApi, readRoomChatMessageForHonoApi, type HonoApiChatDependencies } from '../../rest/chat.js';
import type { HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelChatRoom: HonoStreamChannelDefinition<HonoApiChatDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:chat',
	init: async (deps, ctx, params) => {
		if (typeof params.roomId !== 'string') return false;
		if (!ctx.user) return false;

		const user = ctx.user;
		const roomId = params.roomId;

		const room = await fetchChatRoomByIdFromDatabase(deps.db, roomId);
		if (room == null) return false;
		if (!(await hasPermissionToViewRoomTimelineForHonoApi(deps, user.id, room))) return false;

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
					void readRoomChatMessageForHonoApi(deps, user.id, roomId);
				}
			},
		};
	},
};
