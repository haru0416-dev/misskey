/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onBeforeUnmount, onMounted } from 'vue';
import type * as Misskey from 'misskey-js';
import { genId } from '@/utility/id.js';

type ServerStatsConnection = Misskey.IChannelConnection<Misskey.Channels['serverStats']>;

export function useServerStats(
	connection: ServerStatsConnection,
	onStats: (stats: Misskey.entities.ServerStats) => void,
) {
	function onStatsLog(statsLog: Misskey.entities.ServerStatsLog) {
		for (const revStats of statsLog.toReversed()) {
			onStats(revStats);
		}
	}

	onMounted(() => {
		connection.on('stats', onStats);
		connection.on('statsLog', onStatsLog);
		connection.send('requestLog', {
			id: genId(),
			length: 50,
		});
	});

	onBeforeUnmount(() => {
		connection.off('stats', onStats);
		connection.off('statsLog', onStatsLog);
	});
}
