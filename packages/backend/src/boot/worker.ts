/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { envOption } from '@/env.js';
import { loadConfig } from '@/config.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';

/**
 * Init worker process
 */
export async function workerMain() {
	const config = loadConfig();
	let dispose: () => Promise<void>;

	initExtraThreadPool(config);

	if (envOption.onlyServer) {
		const runtime = await server();
		dispose = () => runtime.dispose();
	} else if (envOption.onlyQueue) {
		const runtime = await jobQueue();
		dispose = () => runtime.close();
	} else {
		const runtime = await jobQueue();
		dispose = () => runtime.close();
	}

	if (cluster.isWorker) {
		process.send!('ready');
	}

	return dispose;
}
