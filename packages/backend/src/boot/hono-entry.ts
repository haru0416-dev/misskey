/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import * as fs from 'node:fs';
import Logger from '@/logger.js';
import { loadConfig } from '@/config.js';
import { readyRef } from '@/boot/ready.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import { createMisskeyHonoApp } from '@/server/hono-app.js';
import { createHonoNodeServer } from '@/server/hono-node-server.js';

process.title = `Misskey Hono (${cluster.isPrimary ? 'primary' : 'worker'})`;
Error.stackTraceLimit = Infinity;

const logger = new Logger('hono', 'cyan');
const config = loadConfig();
const deps = await createRuntimeDependencies(config);
const app = createMisskeyHonoApp({
	http: {
		config,
		meta: deps.meta,
	},
	health: {
		redis: deps.redis,
		redisForPub: deps.redisForPub,
		redisForSub: deps.redisForSub,
		redisForTimelines: deps.redisForTimelines,
		redisForReactions: deps.redisForReactions,
		db: deps.db,
		meilisearch: deps.meilisearch,
	},
	root: {
		config,
		db: deps.db,
		meta: deps.meta,
	},
});
const server = createHonoNodeServer({ app });

async function listen(): Promise<void> {
	if (config.socket) {
		if (fs.existsSync(config.socket)) {
			fs.unlinkSync(config.socket);
		}
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(config.socket, () => {
				server.off('error', reject);
				resolve();
			});
		});
		if (config.chmodSocket) {
			fs.chmodSync(config.socket, config.chmodSocket);
		}
		logger.info(`Listening on ${config.socket}`);
	} else {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(config.port, '0.0.0.0', () => {
				server.off('error', reject);
				resolve();
			});
		});
		logger.info(`Listening on port ${config.port}`);
	}
}

async function shutdown(): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close(err => err ? reject(err) : resolve());
	});
	await deps.dispose();
}

process.on('SIGINT', () => {
	shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
	shutdown().finally(() => process.exit(0));
});

await listen();
readyRef.value = true;

if (process.send) {
	process.send('ok');
}
