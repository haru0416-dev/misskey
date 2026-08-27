/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { JsonValue } from '@/misc/json-value.js';
import { readUserChatMessageForApi, type ApiChatDependencies } from '@/server/rest/chat/chat.js';
import type { StreamChannelDefinition } from '../channel.js';

export const honoStreamChannelChatUser: StreamChannelDefinition<ApiChatDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:chat',
	init: async (deps, ctx, params) => {
		if (typeof params['otherId'] !== 'string') return false;
		if (!ctx.user) return false;
		if (params['otherId'] === ctx.user.id) return false;

		const user = ctx.user;
		const otherId = params['otherId'];

		const handler = (data: { type: string; body: JsonValue }) => {
			ctx.send(data.type, data.body);
		};

		ctx.subscriber.on(`chatUserStream:${user.id}-${otherId}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`chatUserStream:${user.id}-${otherId}`, handler);
			},
			onMessage: (type) => {
				if (type === 'read') {
					void readUserChatMessageForApi(deps, user.id, otherId);
				}
			},
		};
	},
};
