/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { globalEventBus } from '@/misc/global-event-bus.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import type { StreamChannelDefinition } from '../channel.js';

const ev = globalEventBus;

export const honoStreamChannelServerStats: StreamChannelDefinition<unknown> = {
	shouldShare: true,
	requireCredential: false,
	kind: null,
	init: async (_deps, ctx) => {
		const onStats = (stats: JsonObject) => {
			ctx.send('stats', stats);
		};
		ev.addListener('serverStats', onStats);

		return {
			dispose: () => {
				ev.removeListener('serverStats', onStats);
			},
			onMessage: (type: string, body: JsonValue) => {
				if (type === 'requestLog') {
					if (!isJsonObject(body)) return;
					ev.once(`serverStatsLog:${body['id']}`, (statsLog) => {
						ctx.send('statsLog', statsLog as JsonValue);
					});
					ev.emit('requestServerStatsLog', { id: body['id'], length: body['length'] });
				}
			},
		};
	},
};
