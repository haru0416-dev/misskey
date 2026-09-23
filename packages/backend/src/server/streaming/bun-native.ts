/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ApiError } from '../rest/error.js';
import { authenticateApiToken } from '@/server/rest/auth/auth.js';
import { StreamConnection } from './connection.js';
import { createStreamRuntime } from './runtime.js';
import type { StreamServerDependencies } from './runtime.js';

const IDLE_TIMEOUT_MS = 1000 * 60 * 2;
const REAP_INTERVAL_MS = 1000 * 60;

type WsData = {
	connection: StreamConnection;
	cleanup?: () => void;
};

function resolveStreamingToken(authHeader: string | null, url: URL): string | null {
	if (authHeader?.startsWith('Bearer ')) {
		return authHeader.slice(7);
	}
	return url.searchParams.get('i');
}

function errorResponse(error: ApiError): Response {
	return new Response(error.message, {
		status: error.status,
		headers: { 'Content-Type': 'text/plain', ...error.headers },
	});
}

export function createBunNativeStreamRuntime(deps: StreamServerDependencies, streamingPath = '/streaming') {
	const runtime = createStreamRuntime(deps);

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
			authenticated = await authenticateApiToken(deps, token);
		} catch (err) {
			if (err instanceof ApiError) {
				return errorResponse(err);
			}
			return new Response('Internal error', { status: 500 });
		}

		if (authenticated.token != null && !authenticated.token.permission.includes('read:account')) {
			return errorResponse(
				new ApiError({
					status: 403,
					message: 'Your app does not have necessary permissions to use websocket API.',
					code: 'PERMISSION_DENIED',
					id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1e3c',
				}),
			);
		}
		if (authenticated.user?.isSuspended) {
			return errorResponse(
				new ApiError({
					status: 403,
					message: 'Your account has been suspended.',
					code: 'YOUR_ACCOUNT_SUSPENDED',
					id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed57db7f7',
				}),
			);
		}

		const connection = new StreamConnection(deps, authenticated.user, authenticated.token);
		try {
			await runtime.init(connection);
		} catch {
			return new Response('Stream initialization failed', { status: 503 });
		}

		const upgraded = server.upgrade<WsData>(request, { data: { connection } });
		if (!upgraded) {
			runtime.release(connection);
			return new Response('WebSocket upgrade failed', { status: 400 });
		}
		return undefined;
	}

	const websocket: Bun.WebSocketHandler<WsData> = {
		open(ws) {
			const { connection } = ws.data;
			connections.set(ws, Date.now());

			const cleanup = runtime.listen(
				connection,
				(raw) => ws.send(raw),
				() => ws.terminate(),
			);
			ws.data.cleanup = () => {
				cleanup();
				connections.delete(ws);
			};
		},
		message(ws, message) {
			const byteLength = typeof message === 'string' ? Buffer.byteLength(message) : message.byteLength;
			if (byteLength > 1024 * 1024) {
				ws.close(1009, 'Message too large');
				return;
			}
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
		dispose: () => {
			clearInterval(reaperIntervalId);
			runtime.dispose();
			connections.clear();
		},
	};
}
