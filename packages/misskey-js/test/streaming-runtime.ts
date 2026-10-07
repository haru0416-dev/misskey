// WebSocket の実装ごとに挙動が違う (Bun は close() の中で close イベントを同期に発火する、
// 未接続の send() の扱いが違うなど)。モックでは見えないので、実際のソケットで接続から close までを通す。
// Bun では `ws` の import が Bun 独自の実装に差し替わり、Node では npm の ws になる。
// package.json の test (Bun) と test:node (Node) の両方で走らせる。

import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import WsPackageWebSocket, { WebSocketServer } from 'ws';
import type { WebSocket as ServerSocket } from 'ws';
import Stream from '../src/streaming.js';

const runtime = 'Bun' in globalThis ? 'bun' : 'node';

/** 届いた順に値を溜め、まだ無ければ届くまで待つ。待ちには上限を設ける。 */
class Inbox<T> {
	private items: T[] = [];
	private waiters: ((item: T) => void)[] = [];

	public push(item: T): void {
		const waiter = this.waiters.shift();
		if (waiter) waiter(item);
		else this.items.push(item);
	}

	public get size(): number {
		return this.items.length;
	}

	public next(label: string, timeoutMs = 5000): Promise<T> {
		const item = this.items.shift();
		if (item !== undefined) return Promise.resolve(item);
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters.splice(this.waiters.indexOf(onItem), 1);
				reject(new Error(`timed out waiting for ${label}`));
			}, timeoutMs);
			const onItem = (value: T): void => {
				clearTimeout(timer);
				resolve(value);
			};
			this.waiters.push(onItem);
		});
	}
}

type ServerConnection = {
	socket: ServerSocket;
	url: URL;
	messages: Inbox<unknown>;
};

const implementations: [string, unknown][] = [
	['globalThis.WebSocket', globalThis.WebSocket],
	['ws パッケージ', WsPackageWebSocket],
];

test('指定した実行環境で動いている', () => {
	// test と test:node が実行環境を取り違えると、片方の環境を検証しないまま通る。
	const expected = process.env['MISSKEY_JS_TEST_RUNTIME'];
	if (expected == null) return;
	expect(runtime).toBe(expected);
});

describe.each(implementations)(`Stream over a real socket (${runtime}, %s)`, (_name, WebSocketImpl) => {
	let server: WebSocketServer;
	let connections: Inbox<ServerConnection>;

	beforeEach(async () => {
		// 組み込みの WebSocket が無い実行環境 (Node 21 以前) では、検証したことにせず失敗させる。
		if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket implementation is not available');
		connections = new Inbox();
		server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		server.on('connection', (socket, request) => {
			// 接続直後に届くメッセージを取りこぼさないよう、接続を渡す前に受信を始める。
			const messages = new Inbox<unknown>();
			socket.on('message', (data) => messages.push(JSON.parse(String(data))));
			connections.push({ socket, url: new URL(request.url ?? '/', 'http://127.0.0.1'), messages });
		});
		await once(server, 'listening');
	});

	afterEach(async () => {
		for (const client of server.clients) client.terminate();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	test('接続前の購読を送り、切断後は再接続して再購読し、close 後は再接続しない', async () => {
		const { port } = server.address() as AddressInfo;
		const stream = new Stream(`http://127.0.0.1:${port}`, { token: 'TOKEN' }, { WebSocket: WebSocketImpl as never });
		const received: unknown[] = [];
		const receivedInbox = new Inbox<unknown>();
		// 接続が開く前に購読する。connect は送信キューで待ち、開いた後に届く必要がある。
		const chat = stream.useChannel('chat', { other: 'aaa' });
		chat.on('message', (payload) => {
			received.push(payload);
			receivedInbox.push(payload);
		});

		const first = await connections.next('first connection');
		expect(first.url.pathname).toBe('/streaming');
		expect(first.url.searchParams.get('i')).toBe('TOKEN');
		const connect = (await first.messages.next('first connect')) as { type: string; body: { id: string } };
		expect(connect).toMatchObject({ type: 'connect', body: { channel: 'chat', params: { other: 'aaa' } } });

		first.socket.send(JSON.stringify({ type: 'channel', body: { id: connect.body.id, type: 'message', body: { id: 'first' } } }));
		await receivedInbox.next('first channel message');

		const disconnected = new Promise<void>((resolve) => stream.once('_disconnected_', () => resolve()));
		first.socket.terminate();
		await disconnected;

		const second = await connections.next('reconnection');
		expect(await second.messages.next('connect after reconnection')).toMatchObject({
			type: 'connect',
			body: { id: connect.body.id, channel: 'chat', params: { other: 'aaa' } },
		});
		second.socket.send(JSON.stringify({ type: 'channel', body: { id: connect.body.id, type: 'message', body: { id: 'second' } } }));
		await receivedInbox.next('second channel message');
		expect(received).toEqual([{ id: 'first' }, { id: 'second' }]);

		const closedByClient = once(second.socket, 'close');
		expect(() => stream.close()).not.toThrow();
		await closedByClient;
		// 再接続の最小遅延 (1ms) を大きく超えて待っても、新しい接続を張らない。
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(connections.size).toBe(0);
		expect(server.clients.size).toBe(0);
	});

	// Node 組み込みの WebSocket は接続中の close() で close イベントを同期に発火する。
	test('接続が開く前に close しても例外を出さず、接続を残さない', async () => {
		const { port } = server.address() as AddressInfo;
		const stream = new Stream(`http://127.0.0.1:${port}`, { token: 'TOKEN' }, { WebSocket: WebSocketImpl as never });
		stream.useChannel('chat', { other: 'aaa' });

		expect(() => stream.close()).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(server.clients.size).toBe(0);
	});
});
