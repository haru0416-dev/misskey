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
import { createOAuthProviderRuntime } from '@/server/oauth/OAuthProviderRuntime.js';
import { createClientCommonDataLoader } from '@/server/web/client-common-data.js';

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
	const oauthRuntime = createOAuthProviderRuntime({
		config,
		db: deps.db,
		httpRequestService: deps.httpRequestService,
		getCommonData: createClientCommonDataLoader({
			config,
			db: deps.db,
			meta: deps.meta,
		}),
		logger: deps.loggerService.getLogger('oauth'),
	});
	const app = createMisskeyHonoApp({
		http: {
			config,
			meta: deps.meta,
		},
		apiShell: {
			config,
			db: deps.db,
			dbPool: deps.drizzlePool,
			meta: deps.meta,
			redis: deps.redis,
			redisForTimelines: deps.redisForTimelines,
			downloadService: deps.downloadService,
			fileInfoService: deps.fileInfoService,
			httpRequestService: deps.httpRequestService,
			imageProcessingService: deps.imageProcessingService,
			internalStorageService: deps.internalStorageService,
			s3Service: deps.s3Service,
			userAuthService: deps.userAuthService,
			videoProcessingService: deps.videoProcessingService,
			webAuthnService: deps.webAuthnService,
			emailService: deps.emailService,
			chartWriters: deps.chartWriters,
			systemQueue: deps.systemQueue,
			endedPollNotificationQueue: deps.endedPollNotificationQueue,
			postScheduledNoteQueue: deps.postScheduledNoteQueue,
			deliverQueue: deps.deliverQueue,
			inboxQueue: deps.inboxQueue,
			dbQueue: deps.dbQueue,
			relationshipQueue: deps.relationshipQueue,
			objectStorageQueue: deps.objectStorageQueue,
			userWebhookDeliverQueue: deps.userWebhookDeliverQueue,
			systemWebhookDeliverQueue: deps.systemWebhookDeliverQueue,
			logger: deps.loggerService.getLogger('Signin'),
			publishInternalEvent: (type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: 'internal',
					message: {
						type,
						body: value,
					},
				}));
			},
			publishBroadcastStream: (type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: 'broadcast',
					message: {
						type,
						body: value,
					},
				}));
			},
			publishMainStream: (userId, type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: `mainStream:${userId}`,
					message: {
						type,
						body: value,
					},
				}));
			},
			publishDriveStream: (userId, type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: `driveStream:${userId}`,
					message: {
						type,
						body: value,
					},
				}));
			},
			publishUserListStream: (listId, type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: `userListStream:${listId}`,
					message: {
						type,
						body: value,
					},
				}));
			},
			publishChatUserStream: (fromUserId, toUserId, type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: `chatUserStream:${fromUserId}-${toUserId}`,
					message: {
						type,
						body: value,
					},
				}));
			},
			publishChatRoomStream: (toRoomId, type, value) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: `chatRoomStream:${toRoomId}`,
					message: {
						type,
						body: value,
					},
				}));
			},
			publishNotesStream: (note) => {
				deps.redisForPub.publish(config.host, JSON.stringify({
					channel: 'notesStream',
					message: {
						type: null,
						body: note,
					},
				}));
			},
		},
		clientBase: {
			config,
			db: deps.db,
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
		feed: {
			config,
			db: deps.db,
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
		nodeinfo: {
			config,
			db: deps.db,
			meta: deps.meta,
		},
		oauth: {
			runtime: oauthRuntime,
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
		urlPreview: {
			urlPreviewService: deps.urlPreviewService,
		},
		webMetadata: {
			config,
			meta: deps.meta,
		},
		webUtility: {
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
			oauthRuntime.dispose();
			await closeServer(server);
			await deps.dispose();
		},
	};
}
