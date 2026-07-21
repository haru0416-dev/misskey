/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { envOption } from '@/env.js';
import type { Config } from '@/config.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';

/**
 * Init worker process
 */
export async function workerMain(config: Config) {
	let dispose: () => Promise<void>;

	initExtraThreadPool(config);

	if (envOption.onlyServer) {
		const runtime = await server(config);
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
