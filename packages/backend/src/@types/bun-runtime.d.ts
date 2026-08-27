/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// bun-types パッケージ全体を "types" に追加すると @types/node の Request/Response/WebSocket 等の
// グローバル宣言と衝突するため、実際に使っているBun APIだけを最小限に手書きしている。
declare namespace Bun {
	interface Subprocess {
		readonly pid: number;
		readonly exited: Promise<number>;
		kill(signal?: number | NodeJS.Signals): void;
	}

	interface SpawnOptions {
		cwd?: string;
		env?: Record<string, string | undefined>;
		stdout?: 'inherit' | 'ignore' | 'pipe';
		stderr?: 'inherit' | 'ignore' | 'pipe';
		windowsVerbatimArguments?: boolean;
	}

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

// `drizzle-orm/bun-sql` が型解決に使う 'bun' モジュールも、必要な範囲だけ手書きで宣言する。
declare module 'bun' {
	interface SQLQuery extends Promise<unknown[]> {
		values(): Promise<unknown[][]>;
	}

	interface SQLOptions {
		max?: number;
		idleTimeout?: number;
		connectionTimeout?: number;
		prepare?: boolean;
		ssl?: boolean | Record<string, unknown>;
	}

	interface BunFile extends Blob {
		readonly name?: string;
	}

	interface S3ClientOptions {
		bucket: string;
		endpoint?: string;
		region?: string;
		accessKeyId?: string;
		secretAccessKey?: string;
		virtualHostedStyle?: boolean;
	}

	interface S3WriteOptions {
		type?: string;
		contentDisposition?: string;
		acl?: 'public-read' | 'private';
		partSize?: number;
	}

	class S3Client {
		constructor(options: S3ClientOptions);
		write(key: string, data: BunFile | Uint8Array | string | Blob, options?: S3WriteOptions): Promise<number>;
		delete(key: string): Promise<void>;
		exists(key: string): Promise<boolean>;
	}

	class SQL {
		constructor(url: string, options?: SQLOptions);
		unsafe(query: string, params?: unknown[]): SQLQuery;
		begin<T>(callback: (client: SQL) => Promise<T>): Promise<T>;
		savepoint<T>(callback: (client: SQL) => Promise<T>): Promise<T>;
		close(): Promise<void>;
	}
}

declare const Bun:
	| {
			serve<T = undefined>(options: Bun.ServeOptions<T>): Bun.Server;
			spawn(command: string[], options?: Bun.SpawnOptions): Bun.Subprocess;
			file(path: string): Bun.BunFile;
			JSON5: {
				parse(text: string): unknown;
				stringify(value: unknown, replacer?: null, space?: string | number): string;
			};
			S3Client: typeof Bun.S3Client;
			password: {
				hash(password: string, options: { algorithm: 'bcrypt'; cost: number }): Promise<string>;
				hashSync(password: string, options: { algorithm: 'bcrypt'; cost: number }): string;
				verify(password: string, hash: string, algorithm?: 'bcrypt'): Promise<boolean>;
			};
	  }
	| undefined;
