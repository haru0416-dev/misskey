/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import type { Config } from '@/config.js';
import { resolveHostProcessCounts } from '@/misc/process-topology.js';
import { assignmentFromEnv } from './cluster-roles.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';
import { queueReadyRef } from './ready.js';

export async function workerMain(config: Config) {
	let dispose: () => Promise<void>;

	initExtraThreadPool(config);

	const assignment = assignmentFromEnv();
	queueReadyRef.value = resolveHostProcessCounts(config).queue === 0;
	const receiveReadiness = (message: unknown) => {
		if (
			message != null &&
			typeof message === 'object' &&
			'type' in message &&
			message.type === 'queueReadiness' &&
			'ready' in message &&
			typeof message.ready === 'boolean'
		) {
			queueReadyRef.value = message.ready;
		}
	};
	if (assignment.role === 'server') process.on('message', receiveReadiness);

	if (assignment.role === 'server') {
		const runtime = await server(config, undefined, { daemons: assignment.ownsDaemons });
		dispose = () => runtime.dispose();
	} else {
		const runtime = await jobQueue(config);
		runtime.onReadyChange((ready) => {
			queueReadyRef.value = ready;
			if (cluster.isWorker && process.connected) {
				process.send!({ type: 'queueReadiness', ready });
			}
		});
		dispose = () => runtime.close();
	}

	if (cluster.isWorker) {
		process.send!('ready');
	}

	return async () => {
		process.off('message', receiveReadiness);
		await dispose();
	};
}
