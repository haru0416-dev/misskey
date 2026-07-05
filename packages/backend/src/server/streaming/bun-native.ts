/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { updateUserLastActiveDateInDatabase } from '@/core/UserStore.js';
import { HonoApiError } from '../rest/error.js';
import { authenticateHonoApiToken } from '../rest/auth.js';
import { HonoStreamConnection } from './connection.js';
import type { HonoStreamServerDependencies } from './server.js';

const IDLE_TIMEOUT_MS = 1000 * 60 * 2;
const REAP_INTERVAL_MS = 1000 * 60;
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

type WsData = {
	connection: HonoStreamConnection;
	cleanup?: () => void;
};

function resolveStreamingToken(authHeader: string | null, url: URL): string | null {
	if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
	return url.searchParams.get('i');
}

function errorResponse(error: HonoApiError): Response {
	return new Response(error.message, { status: error.status, headers: { 'Content-Type': 'text/plain', ...error.headers } });
}

/**
 * bun ランタイムの node:http compat 層は、'upgrade' イベントで生ソケットに直接書き込む
 * ws パッケージの handleUpgrade パターンだと、同一プロセス内に他のソケット接続 (DB pool や
 * ioredis 等) が1つでもあるとレスポンスがクライアントに届かず永久にハングするバグを踏む
 * (bun 1.3.14 で確認、ws パッケージを完全に迂回した手書き101レスポンスでも再現)。
 * Bun.serve() のネイティブ websocket API はこの経路を通らないため影響を受けない。
 * よって bun 実行時はこちらを使い、Node (テスト実行時) は server.ts の node:http 実装を使う。
 */
export function createBunNativeStreamRuntime(deps: HonoStreamServerDependencies, streamingPath = '/streaming') {
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

	const connections = new Map<Bun.ServerWebSocket<WsData>, number>();

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

	async function tryUpgrade(request: Request, url: URL, server: Bun.Server): Promise<Response | undefined> {
		const token = resolveStreamingToken(request.headers.get('authorization'), url);

		let authenticated;
		try {
			authenticated = await authenticateHonoApiToken(deps, token);
		} catch (err) {
			if (err instanceof HonoApiError) return errorResponse(err);
			return new Response('Internal error', { status: 500 });
		}

		if (authenticated.token != null && !authenticated.token.permission.includes('read:account')) {
			return errorResponse(new HonoApiError({
				status: 403,
				message: 'Your app does not have necessary permissions to use websocket API.',
				code: 'PERMISSION_DENIED',
				id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1e3c',
			}));
		}
		if (authenticated.user?.isSuspended) {
			return errorResponse(new HonoApiError({ status: 403, message: 'Your account has been suspended.', code: 'YOUR_ACCOUNT_SUSPENDED', id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed57db7f7' }));
		}

		const connection = new HonoStreamConnection(deps, authenticated.user, authenticated.token);
		await connection.init();

		const upgraded = server.upgrade<WsData>(request, { data: { connection } });
		if (!upgraded) {
			connection.dispose();
			return new Response('WebSocket upgrade failed', { status: 400 });
		}
		return undefined;
	}

	const websocket: Bun.WebSocketHandler<WsData> = {
		open(ws) {
			const { connection } = ws.data;
			const ev = new EventEmitter();
			const onMessage = (data: { channel: string; message: unknown }) => {
				ev.emit(data.channel, data.message);
			};
			globalEv.on('message', onMessage);
			connections.set(ws, Date.now());

			connection.listen(ev, raw => { ws.send(raw); });

			let lastActiveIntervalId: NodeJS.Timeout | undefined;
			if (connection.user) {
				void updateUserLastActiveDateInDatabase(deps.db, connection.user.id, new Date());
				lastActiveIntervalId = setInterval(() => {
					void updateUserLastActiveDateInDatabase(deps.db, connection.user!.id, new Date());
				}, LAST_ACTIVE_UPDATE_INTERVAL_MS);
			}

			ws.data.cleanup = () => {
				globalEv.off('message', onMessage);
				connection.dispose();
				connections.delete(ws);
				if (lastActiveIntervalId) clearInterval(lastActiveIntervalId);
			};
		},
		message(ws, message) {
			ws.data.connection.handleClientMessage(message.toString());
		},
		close(ws) {
			ws.data.cleanup?.();
		},
		pong(ws) {
			connections.set(ws, Date.now());
		},
	};

	return {
		streamingPath,
		tryUpgrade,
		websocket,
		dispose: async () => {
			clearInterval(reaperIntervalId);
			deps.redisForSub.off('message', onRedisMessage);
		},
	};
}
