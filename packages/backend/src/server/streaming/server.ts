/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import * as WebSocket from 'ws';
import type * as Redis from 'ioredis';
import { updateUserLastActiveDateInDatabase } from '@/core/UserStore.js';
import { HonoApiError } from '../rest/error.js';
import { authenticateHonoApiToken } from '../rest/auth.js';
import {
	HonoStreamConnection,
	refreshHonoStreamConnections,
	type HonoStreamConnectionDependencies,
} from './connection.js';

export type HonoStreamServerDependencies = HonoStreamConnectionDependencies & {
	redisForSub: Redis.Redis;
};

const IDLE_TIMEOUT_MS = 1000 * 60 * 2;
const REAP_INTERVAL_MS = 1000 * 60;
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

function writeRawHttpError(socket: Socket, error: HonoApiError): void {
	const headers = Object.entries({ 'Content-Type': 'text/plain', ...error.headers })
		.map(([key, value]) => `${key}: ${value}`)
		.join('\r\n');
	socket.write(`HTTP/1.1 ${error.status} ${error.message}\r\n${headers}\r\n\r\n${error.message}`);
	socket.destroy();
}

async function authenticateStreamingRequest(
	deps: HonoStreamServerDependencies,
	request: IncomingMessage,
	url: URL,
): Promise<
	| {
			user: Awaited<ReturnType<typeof authenticateHonoApiToken>>['user'];
			token: Awaited<ReturnType<typeof authenticateHonoApiToken>>['token'];
	  }
	| HonoApiError
> {
	const authHeader = request.headers.authorization;
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : url.searchParams.get('i');

	let authenticated;
	try {
		authenticated = await authenticateHonoApiToken(deps, token);
	} catch (err) {
		if (err instanceof HonoApiError) return err;
		return new HonoApiError({
			status: 500,
			message: 'Internal error',
			code: 'INTERNAL_ERROR',
			id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		});
	}

	if (authenticated.token != null && !authenticated.token.permission.includes('read:account')) {
		return new HonoApiError({
			status: 403,
			message: 'Your app does not have necessary permissions to use websocket API.',
			code: 'PERMISSION_DENIED',
			id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1e3c',
		});
	}

	if (authenticated.user?.isSuspended) {
		return new HonoApiError({
			status: 403,
			message: 'Your account has been suspended.',
			code: 'YOUR_ACCOUNT_SUSPENDED',
			id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed57db7f7',
		});
	}

	return authenticated;
}

/**
 * Redis pub/sub の payload はプロセス外から来るので、形が壊れている前提で扱う。
 * この関数は ioredis の 'message' リスナーとして同期的に呼ばれるため、ここで例外を投げると
 * 誰も捕捉できずストリーミングサーバーのプロセスごと落ちる。
 * また EventEmitter は listener の無い 'error' を emit すると throw するので、チャンネル名としては通さない。
 */
export function emitHonoStreamRedisMessage(globalEv: EventEmitter, data: string): void {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		return;
	}
	if (typeof parsed !== 'object' || parsed === null) return;

	const { channel, message } = parsed as { channel?: unknown; message?: unknown };
	if (typeof channel !== 'string' || channel === '' || channel === 'error') return;

	globalEv.emit(channel, message);
}

/** StreamingApiServerService 相当。`server.on('upgrade', ...)` を直接フックし、Hono の fetch パイプラインは経由しない。 */
export function attachHonoStreamServer(
	server: Server,
	deps: HonoStreamServerDependencies,
	streamingPath = '/streaming',
): { detach: () => Promise<void> } {
	const wss = new WebSocket.WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
	const globalEv = new EventEmitter();
	globalEv.setMaxListeners(0);

	const onRedisMessage = (_channelName: string, data: string) => emitHonoStreamRedisMessage(globalEv, data);
	deps.redisForSub.on('message', onRedisMessage);
	const activeConnections = new Map<HonoStreamConnection, () => void>();
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
				await refreshHonoStreamConnections(activeConnections);
			} while (reconnectRefreshQueued);
		})()
			.catch((error) => console.error('Failed to refresh streaming connections after Redis reconnected.', error))
			.finally(() => {
				reconnectRefreshPromise = undefined;
			});
	};
	deps.redisForSub.on('ready', onRedisReady);

	const connections = new Map<WebSocket.WebSocket, number>();

	const upgradeHandler = async (request: IncomingMessage, socket: Socket, head: Buffer) => {
		let connection: HonoStreamConnection | undefined;
		let socketClosed = false;
		socket.once('close', () => {
			socketClosed = true;
			connection?.dispose();
		});
		if (request.url == null) {
			socket.destroy();
			return;
		}

		const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
		if (url.pathname !== streamingPath) return;

		const authenticated = await authenticateStreamingRequest(deps, request, url);
		if (socketClosed) return;
		if (authenticated instanceof HonoApiError) {
			writeRawHttpError(socket, authenticated);
			return;
		}

		connection = new HonoStreamConnection(deps, authenticated.user, authenticated.token);
		try {
			await connection.init(globalEv);
		} catch {
			socket.destroy();
			return;
		}

		// init 中に切断された場合、close ハンドラの dispose は初期化途中の状態に対して走っている。
		// そのまま upgrade すると閉じたソケットに対するコネクションが残るので、ここで作り直させる
		if (socketClosed) {
			connection.dispose();
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request, connection);
		});
	};
	server.on('upgrade', (request, socket, head) => {
		void upgradeHandler(request, socket as Socket, head);
	});

	wss.on('connection', (ws: WebSocket.WebSocket, _request: IncomingMessage, connection: HonoStreamConnection) => {
		activeConnections.set(connection, () => ws.terminate());
		connections.set(ws, Date.now());

		connection.listen(globalEv, (raw) => ws.send(raw));

		ws.on('message', (data: WebSocket.RawData) => connection.handleClientMessage(data.toString()));

		let lastActiveIntervalId: NodeJS.Timeout | undefined;
		if (connection.user) {
			void updateUserLastActiveDateInDatabase(deps.db, connection.user.id, new Date());
			lastActiveIntervalId = setInterval(() => {
				void updateUserLastActiveDateInDatabase(deps.db, connection.user!.id, new Date());
			}, LAST_ACTIVE_UPDATE_INTERVAL_MS);
		}

		ws.on('close', () => {
			activeConnections.delete(connection);
			connection.dispose();
			connections.delete(ws);
			if (lastActiveIntervalId) clearInterval(lastActiveIntervalId);
		});

		ws.on('pong', () => {
			connections.set(ws, Date.now());
		});
	});

	const reaperIntervalId = setInterval(() => {
		const now = Date.now();
		for (const [ws, lastActive] of connections) {
			if (now - lastActive > IDLE_TIMEOUT_MS) {
				ws.terminate();
			} else {
				ws.ping();
			}
		}
	}, REAP_INTERVAL_MS);

	return {
		detach: async () => {
			clearInterval(reaperIntervalId);
			deps.redisForSub.off('message', onRedisMessage);
			deps.redisForSub.off('ready', onRedisReady);
			for (const ws of connections.keys()) ws.terminate();
			await new Promise<void>((resolve, reject) => {
				wss.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}
