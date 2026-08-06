/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// bun-types パッケージ全体を "types" に追加すると @types/node の Request/Response/WebSocket 等の
// グローバル宣言と衝突するため、実際に使っている Bun.serve 関連のAPIだけを最小限に手書きしている。
declare namespace Bun {
	interface ServerWebSocket<T = undefined> {
		data: T;
		readonly readyState: number;
		send(data: string): number;
		close(code?: number, reason?: string): void;
		terminate(): void;
		ping(data?: string): number;
	}

	interface WebSocketHandler<T = undefined> {
		open?(ws: ServerWebSocket<T>): void | Promise<void>;
		message(ws: ServerWebSocket<T>, message: string | Buffer): void | Promise<void>;
		close?(ws: ServerWebSocket<T>, code: number, reason: string): void | Promise<void>;
		pong?(ws: ServerWebSocket<T>, data: Buffer): void;
	}

	interface RequestIP {
		address: string;
		family: 'IPv4' | 'IPv6';
		port: number;
	}

	interface Server {
		readonly port: number;
		readonly hostname: string;
		upgrade<T = undefined>(request: Request, options?: { data?: T }): boolean;
		requestIP(request: Request): RequestIP | null;
		stop(closeActiveConnections?: boolean): Promise<void>;
	}

	interface ServeOptions<T = undefined> {
		port?: number;
		hostname?: string;
		unix?: string;
		maxRequestBodySize?: number;
		fetch(
			this: Server,
			request: Request,
			server: Server,
		): Response | Promise<Response> | undefined | Promise<Response | undefined>;
		websocket?: WebSocketHandler<T>;
	}
}

declare const Bun:
	| {
			serve<T = undefined>(options: Bun.ServeOptions<T>): Bun.Server;
			password: {
				hash(password: string, options: { algorithm: 'bcrypt'; cost: number }): Promise<string>;
				hashSync(password: string, options: { algorithm: 'bcrypt'; cost: number }): string;
				verify(password: string, hash: string, algorithm?: 'bcrypt'): Promise<boolean>;
			};
	  }
	| undefined;
