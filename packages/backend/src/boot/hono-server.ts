/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Server } from 'node:http';
import * as fs from 'node:fs';
import Logger from '@/logger.js';
import type { Config } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createMisskeyHonoApp } from '@/server/hono-app.js';
import { createHonoNodeServer } from '@/server/hono-node-server.js';

export type HonoServerRuntime = {
	server: Server;
	deps: RuntimeDependencies;
	dispose: () => Promise<void>;
};

async function listen(server: Server, config: Config, logger: Logger): Promise<void> {
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

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) return;

	await new Promise<void>((resolve, reject) => {
		server.close(err => err ? reject(err) : resolve());
	});
}

export async function launchHonoServer(config: Config, logger = new Logger('hono', 'cyan')): Promise<HonoServerRuntime> {
	const deps = await createRuntimeDependencies(config);
	const app = createMisskeyHonoApp({
		http: {
			config,
			meta: deps.meta,
		},
		file: {
			config,
			db: deps.db,
			fileInfoService: deps.fileInfoService,
			downloadService: deps.downloadService,
			imageProcessingService: deps.imageProcessingService,
			videoProcessingService: deps.videoProcessingService,
			internalStorageService: deps.internalStorageService,
			logger: deps.loggerService.getLogger('server', 'gray'),
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
		nodeinfo: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		openApi: {
			config,
		},
		root: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		staticAssets: {
			config,
		},
		webMetadata: {
			config,
			meta: deps.meta,
		},
		wellKnown: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
	});
	const server = createHonoNodeServer({ app });
	let disposed = false;

	await listen(server, config, logger);

	return {
		server,
		deps,
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			await closeServer(server);
			await deps.dispose();
		},
	};
}
