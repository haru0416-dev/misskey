/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import type * as Redis from 'ioredis';
import { updateUserLastActiveDateInDatabase } from '@/core/user/UserStore.js';
import { refreshStreamConnections } from './connection.js';
import type { StreamConnection, StreamConnectionDependencies } from './connection.js';

export type StreamServerDependencies = StreamConnectionDependencies & {
	redisForSub: Redis.Redis;
};

const LAST_ACTIVE_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

/**
 * Redis pub/sub の payload はプロセス外から来るので、形が壊れている前提で扱う。
 * この関数は ioredis の 'message' リスナーとして同期的に呼ばれるため、ここで例外を投げると
 * 誰も捕捉できずストリーミングサーバーのプロセスごと落ちる。
 * また EventEmitter は listener の無い 'error' を emit すると throw するので、チャンネル名としては通さない。
 */
export function emitStreamRedisMessage(globalEv: EventEmitter, data: string): void {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		return;
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return;
	}

	const { channel, message } = parsed as { channel?: unknown; message?: unknown };
	if (typeof channel !== 'string' || channel === '' || channel === 'error') {
		return;
	}

	globalEv.emit(channel, message);
}

export function createStreamRuntime(deps: StreamServerDependencies) {
	const globalEv = new EventEmitter();
	globalEv.setMaxListeners(0);
	const onRedisMessage = (_channelName: string, data: string) => emitStreamRedisMessage(globalEv, data);
	deps.redisForSub.on('message', onRedisMessage);
	const activeConnections = new Map<StreamConnection, () => void>();
	const pendingConnections = new Set<StreamConnection>();
	let disposed = false;
	let reconnectRefreshPromise: Promise<void> | undefined;
	let reconnectRefreshQueued = false;
	const onRedisReady = () => {
		if (reconnectRefreshPromise != null) {
			reconnectRefreshQueued = true;
			return;
		}
		reconnectRefreshPromise = (async () => {
			do {
				reconnectRefreshQueued = false;
				// 更新中に再接続した場合は、更新完了後にスナップショットをもう一度取得する。
				// eslint-disable-next-line no-await-in-loop
				await refreshStreamConnections(activeConnections);
				if (disposed) break;
			} while (reconnectRefreshQueued);
		})()
			.catch((error) => console.error('Failed to refresh streaming connections after Redis reconnected.', error))
			.finally(() => {
				reconnectRefreshPromise = undefined;
			});
	};
	deps.redisForSub.on('ready', onRedisReady);

	function release(connection: StreamConnection): void {
		pendingConnections.delete(connection);
		connection.dispose();
	}

	return {
		async init(connection: StreamConnection): Promise<void> {
			if (disposed) {
				throw new Error('Streaming server is disposed');
			}
			pendingConnections.add(connection);
			try {
				await connection.init(globalEv);
				// HTTP 停止と非同期の初期化が競合しても、upgrade 待ちの購読を残さない。
				if (disposed) {
					throw new Error('Streaming server is disposed');
				}
			} catch (error) {
				release(connection);
				throw error;
			}
		},
		release,
		listen(connection: StreamConnection, send: (raw: string) => void, terminate: () => void): () => void {
			pendingConnections.delete(connection);
			let lastActiveIntervalId: NodeJS.Timeout | undefined;
			let closed = false;
			const cleanup = () => {
				if (closed) return;
				closed = true;
				activeConnections.delete(connection);
				connection.dispose();
				clearInterval(lastActiveIntervalId);
			};
			if (disposed) {
				cleanup();
				terminate();
				return cleanup;
			}
			activeConnections.set(connection, () => {
				cleanup();
				terminate();
			});
			connection.listen(globalEv, send);

			const user = connection.user;
			if (user) {
				void updateUserLastActiveDateInDatabase(deps.db, user.id, new Date());
				lastActiveIntervalId = setInterval(() => {
					void updateUserLastActiveDateInDatabase(deps.db, user.id, new Date());
				}, LAST_ACTIVE_UPDATE_INTERVAL_MS);
			}
			return cleanup;
		},
		dispose(): void {
			disposed = true;
			deps.redisForSub.off('message', onRedisMessage);
			deps.redisForSub.off('ready', onRedisReady);
			for (const terminate of activeConnections.values()) {
				terminate();
			}
			for (const connection of pendingConnections) {
				release(connection);
			}
		},
	};
}
