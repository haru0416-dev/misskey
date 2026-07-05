/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Xev from 'xev';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import type { HonoStreamChannelDefinition } from '../channel.js';

const ev = new Xev();

/** QueueStatsChannel 相当。hono-daemon-queue-stats.ts が発行する Xev イベントを購読する。 */
export const honoStreamChannelQueueStats: HonoStreamChannelDefinition<unknown> = {
	shouldShare: true,
	requireCredential: false,
	kind: null,
	init: async (_deps, ctx) => {
		const onStats = (stats: JsonObject) => {
			ctx.send('stats', stats);
		};
		ev.addListener('queueStats', onStats);

		return {
			dispose: () => {
				ev.removeListener('queueStats', onStats);
			},
			onMessage: (type: string, body: JsonValue) => {
				if (type === 'requestLog') {
					if (!isJsonObject(body)) return;
					if (typeof body.id !== 'string') return;
					if (typeof body.length !== 'number') return;
					ev.once(`queueStatsLog:${body.id}`, statsLog => {
						ctx.send('statsLog', statsLog as JsonValue);
					});
					ev.emit('requestQueueStatsLog', { id: body.id, length: body.length });
				}
			},
		};
	},
};
