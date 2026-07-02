/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import Logger from '@/logger.js';
import { loadConfig } from '@/config.js';
import { readyRef } from '@/boot/ready.js';
import { launchHonoServer } from './hono-server.js';

process.title = `Misskey Hono (${cluster.isPrimary ? 'primary' : 'worker'})`;
Error.stackTraceLimit = Infinity;

const logger = new Logger('hono', 'cyan');
const config = loadConfig();
const runtime = await launchHonoServer(config, logger);

async function shutdown(): Promise<void> {
	await runtime.dispose();
}

process.on('SIGINT', () => {
	shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
	shutdown().finally(() => process.exit(0));
});

readyRef.value = true;

if (process.send) {
	process.send('ok');
}
