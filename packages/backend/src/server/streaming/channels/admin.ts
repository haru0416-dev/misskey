/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { JsonValue } from '@/misc/json-value.js';
import type { StreamChannelDefinition } from '../channel.js';

export const honoStreamChannelAdmin: StreamChannelDefinition<unknown> = {
	shouldShare: true,
	requireCredential: true,
	kind: 'read:admin:stream',
	init: async (_deps, ctx) => {
		if (!ctx.user) return false;

		const handler = (data: { type: string; body: JsonValue }) => {
			ctx.send(data.type, data.body);
		};

		ctx.subscriber.on(`adminStream:${ctx.user.id}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`adminStream:${ctx.user!.id}`, handler);
			},
		};
	},
};
