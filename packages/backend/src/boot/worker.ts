/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import type { Config } from '@/config.js';
import { assignmentFromEnv } from './cluster-roles.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';

export async function workerMain(config: Config) {
	let dispose: () => Promise<void>;

	initExtraThreadPool(config);

	// 役割は master が fork 時に env で渡す (cluster-roles.ts)
	const assignment = assignmentFromEnv();

	if (assignment.role === 'server') {
		const runtime = await server(config, undefined, { daemons: assignment.ownsDaemons });
		dispose = () => runtime.dispose();
	} else {
		const runtime = await jobQueue(config);
		dispose = () => runtime.close();
	}

	if (cluster.isWorker) {
		process.send!('ready');
	}

	return dispose;
}
