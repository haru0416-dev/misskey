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
import { HonoStreamConnection, type HonoStreamConnectionDependencies } from './connection.js';

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

/** StreamingApiServerService の Authorization/`?i=` トークン解決+パーミッションチェック相当。 */
async function authenticateStreamingRequest(
	deps: HonoStreamServerDependencies,
	request: IncomingMessage,
	url: URL,
): Promise<{ user: Awaited<ReturnType<typeof authenticateHonoApiToken>>['user']; token: Awaited<ReturnType<typeof authenticateHonoApiToken>>['token'] } | HonoApiError> {
	const authHeader = request.headers.authorization;
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : url.searchParams.get('i');

	let authenticated;
	try {
		authenticated = await authenticateHonoApiToken(deps, token);
	} catch (err) {
		if (err instanceof HonoApiError) return err;
		return new HonoApiError({ status: 500, message: 'Internal error', code: 'INTERNAL_ERROR', id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac' });
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
		return new HonoApiError({ status: 403, message: 'Your account has been suspended.', code: 'YOUR_ACCOUNT_SUSPENDED', id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed57db7f7' });
	}

	return authenticated;
}

/** StreamingApiServerService 相当。`server.on('upgrade', ...)` を直接フックし、Hono の fetch パイプラインは経由しない。 */
export function attachHonoStreamServer(server: Server, deps: HonoStreamServerDependencies, streamingPath = '/streaming'): { detach: () => Promise<void> } {
	const wss = new WebSocket.WebSocketServer({ noServer: true });
	const globalEv = new EventEmitter();

	const onRedisMessage = (_channelName: string, data: string) => {
		let parsed: { channel: string; message: unknown };
		try {
			parsed = JSON.parse(data);
		} catch {
			return;
		}
		globalEv.emit('message', parsed);
	};
	deps.redisForSub.on('message', onRedisMessage);

	const connections = new Map<WebSocket.WebSocket, number>();

	const upgradeHandler = async (request: IncomingMessage, socket: Socket, head: Buffer) => {
		if (request.url == null) {
			socket.destroy();
			return;
		}

		const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
		if (url.pathname !== streamingPath) return;

		const authenticated = await authenticateStreamingRequest(deps, request, url);
		if (authenticated instanceof HonoApiError) {
			writeRawHttpError(socket, authenticated);
			return;
		}

		const connection = new HonoStreamConnection(deps, authenticated.user, authenticated.token);
		await connection.init();

		wss.handleUpgrade(request, socket, head, ws => {
			wss.emit('connection', ws, request, connection);
		});
	};
	server.on('upgrade', (request, socket, head) => {
		void upgradeHandler(request, socket as Socket, head);
	});

	wss.on('connection', (ws: WebSocket.WebSocket, _request: IncomingMessage, connection: HonoStreamConnection) => {
		const ev = new EventEmitter();
		const onMessage = (data: { channel: string; message: unknown }) => {
			ev.emit(data.channel, data.message);
		};
		globalEv.on('message', onMessage);
		connections.set(ws, Date.now());

		connection.listen(ev, raw => ws.send(raw));

		ws.on('message', (data: WebSocket.RawData) => connection.handleClientMessage(data.toString()));

		let lastActiveIntervalId: NodeJS.Timeout | undefined;
		if (connection.user) {
			void updateUserLastActiveDateInDatabase(deps.db, connection.user.id, new Date());
			lastActiveIntervalId = setInterval(() => {
				void updateUserLastActiveDateInDatabase(deps.db, connection.user!.id, new Date());
			}, LAST_ACTIVE_UPDATE_INTERVAL_MS);
		}

		ws.on('close', () => {
			globalEv.off('message', onMessage);
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
			await new Promise<void>((resolve, reject) => {
				wss.close(err => err ? reject(err) : resolve());
			});
		},
	};
}
