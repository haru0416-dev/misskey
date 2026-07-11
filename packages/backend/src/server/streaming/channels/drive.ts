/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { JsonValue } from '@/misc/json-value.js';
import type { HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelDrive: HonoStreamChannelDefinition<unknown> = {
	shouldShare: true,
	requireCredential: true,
	kind: 'read:account',
	init: async (_deps, ctx) => {
		if (!ctx.user) return false;

		const handler = (data: { type: string; body: JsonValue }) => {
			ctx.send(data.type, data.body);
		};

		ctx.subscriber.on(`driveStream:${ctx.user.id}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`driveStream:${ctx.user!.id}`, handler);
			},
		};
	},
};
