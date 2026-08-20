import { describe, test, expect, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { MAX_OFFLINE_MESSAGE_BYTES, MAX_OFFLINE_MESSAGE_COUNT } from '../src/reconnecting-ws.js';
import Stream from '../src/streaming.js';

describe('Streaming', () => {
	test('useChannel', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const mainChannelReceived: any[] = [];
		const main = stream.useChannel('main');
		main.on('meUpdated', payload => {
			mainChannelReceived.push(payload);
		});

		const ws = await server.connected;
		expect(new URLSearchParams(new URL(ws.url).search).get('i')).toEqual('TOKEN');

		const msg = JSON.parse(await server.nextMessage as string);
		const mainChannelId = msg.body.id;
		expect(msg.type).toEqual('connect');
		expect(msg.body.channel).toEqual('main');
		expect(mainChannelId != null).toEqual(true);

		server.send(JSON.stringify({
			type: 'channel',
			body: {
				id: mainChannelId,
				type: 'meUpdated',
				body: {
					id: 'foo'
				}
			}
		}));

		expect(mainChannelReceived[0]).toEqual({
			id: 'foo'
		});

		stream.close();
		server.close();
	});

	test('useChannel with parameters', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const chatChannelReceived: any[] = [];
		const chat = stream.useChannel('chat', { other: 'aaa' });
		chat.on('message', payload => {
			chatChannelReceived.push(payload);
		});

		const ws = await server.connected;
		expect(new URLSearchParams(new URL(ws.url).search).get('i')).toEqual('TOKEN');

		const msg = JSON.parse(await server.nextMessage as string);
		const chatChannelId = msg.body.id;
		expect(msg.type).toEqual('connect');
		expect(msg.body.channel).toEqual('chat');
		expect(msg.body.params).toEqual({ other: 'aaa' });
		expect(chatChannelId != null).toEqual(true);

		server.send(JSON.stringify({
			type: 'channel',
			body: {
				id: chatChannelId,
				type: 'message',
				body: {
					id: 'foo'
				}
			}
		}));

		expect(chatChannelReceived[0]).toEqual({
			id: 'foo'
		});

		stream.close();
		server.close();
	});

	test('ちゃんとチャンネルごとにidが異なる', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });

		stream.useChannel('chat', { other: 'aaa' });
		stream.useChannel('chat', { other: 'bbb' });

		const ws = await server.connected;
		expect(new URLSearchParams(new URL(ws.url).search).get('i')).toEqual('TOKEN');

		const msg = JSON.parse(await server.nextMessage as string);
		const chatChannelId = msg.body.id;
		const msg2 = JSON.parse(await server.nextMessage as string);
		const chatChannelId2 = msg2.body.id;

		expect(chatChannelId != null).toEqual(true);
		expect(chatChannelId2 != null).toEqual(true);
		expect(chatChannelId).not.toEqual(chatChannelId2);

		stream.close();
		server.close();
	});

	test('Connection#send', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });

		const chat = stream.useChannel('chat', { other: 'aaa' });
		chat.send('read', { id: 'aaa' });

		const ws = await server.connected;
		expect(new URLSearchParams(new URL(ws.url).search).get('i')).toEqual('TOKEN');

		const connectMsg = JSON.parse(await server.nextMessage as string);
		const channelId = connectMsg.body.id;
		const msg = JSON.parse(await server.nextMessage as string);

		expect(msg.type).toEqual('ch');
		expect(msg.body.id).toEqual(channelId);
		expect(msg.body.type).toEqual('read');
		expect(msg.body.body).toEqual({ id: 'aaa' });

		stream.close();
		server.close();
	});

	test('Connection#dispose', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const mainChannelReceived: any[] = [];
		const main = stream.useChannel('main');
		main.on('meUpdated', payload => {
			mainChannelReceived.push(payload);
		});

		const ws = await server.connected;
		expect(new URLSearchParams(new URL(ws.url).search).get('i')).toEqual('TOKEN');

		const msg = JSON.parse(await server.nextMessage as string);
		const mainChannelId = msg.body.id;
		expect(msg.type).toEqual('connect');
		expect(msg.body.channel).toEqual('main');
		expect(mainChannelId != null).toEqual(true);
		main.dispose();

		server.send(JSON.stringify({
			type: 'channel',
			body: {
				id: mainChannelId,
				type: 'meUpdated',
				body: {
					id: 'foo'
				}
			}
		}));

		expect(mainChannelReceived.length).toEqual(0);

		stream.close();
		server.close();
	});

	test('サーバー切断後に自動再接続し、共有チャンネルを再購読する', async () => {
		let server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const connected: unknown[] = [];
		stream.on('_connected_', () => connected.push(true));
		stream.useChannel('main');

		await server.connected;
		const first = JSON.parse(await server.nextMessage as string);
		expect(first.type).toEqual('connect');
		expect(first.body.channel).toEqual('main');

		// サーバー側から切断し、同じURLで新しいサーバーを立てる
		server.close();
		server = new WS('wss://misskey.test/streaming');

		// 自動再接続して main チャンネルの connect が再送される
		await server.connected;
		const resub = JSON.parse(await server.nextMessage as string);
		expect(resub.type).toEqual('connect');
		expect(resub.body.channel).toEqual('main');
		expect(resub.body.id).toEqual(first.body.id);
		expect(connected.length).toEqual(2);

		stream.close();
		server.close();
	});

	test('再接続時は再購読をキュー済みチャンネルメッセージより先に送る', async () => {
		let server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const chat = stream.useChannel('chat', { other: 'aaa' });
		let connectedCount = 0;
		stream.on('_connected_', () => {
			connectedCount++;
			if (connectedCount === 2) chat.send('read', { id: 'from-connected-listener' });
		});

		try {
			await server.connected;
			const initialConnect = await server.nextMessage as { type: string; body: { id: string; }; };
			server.close();

			stream.send('generic', { order: 1 });
			chat.send('read', { id: 'queued' });
			stream.send('generic', { order: 2 });

			server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
			await server.connected;

			expect(await server.nextMessage).toEqual(initialConnect);
			expect(await server.nextMessage).toEqual({ type: 'generic', body: { order: 1 } });
			expect(await server.nextMessage).toEqual({
				type: 'ch',
				body: { id: initialConnect.body.id, type: 'read', body: { id: 'queued' } },
			});
			expect(await server.nextMessage).toEqual({ type: 'generic', body: { order: 2 } });
			expect(await server.nextMessage).toEqual({
				type: 'ch',
				body: { id: initialConnect.body.id, type: 'read', body: { id: 'from-connected-listener' } },
			});
		} finally {
			stream.close();
			server.close();
		}
	});

	test('通常キューの件数上限を超えても複数チャンネルの再購読を破棄しない', async () => {
		let server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const channels = [
			stream.useChannel('chat', { other: 'aaa' }),
			stream.useChannel('chat', { other: 'bbb' }),
			stream.useChannel('chat', { other: 'ccc' }),
		];

		try {
			await server.connected;
			const initialConnects = [];
			while (initialConnects.length < channels.length) {
				initialConnects.push(await server.nextMessage);
			}
			server.close();

			for (let i = 0; i <= MAX_OFFLINE_MESSAGE_COUNT; i++) {
				stream.send('generic', { index: i });
			}

			server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
			await server.connected;
			for (const connect of initialConnects) {
				expect(await server.nextMessage).toEqual(connect);
			}

			for (let i = 1; i <= MAX_OFFLINE_MESSAGE_COUNT; i++) {
				expect(await server.nextMessage).toEqual({ type: 'generic', body: { index: i } });
			}
		} finally {
			stream.close();
			server.close();
		}
	});

	test('通常キューのバイト上限を超えても複数チャンネルの再購読を破棄しない', async () => {
		let server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const channels = [
			stream.useChannel('chat', { other: 'aaa' }),
			stream.useChannel('chat', { other: 'bbb' }),
		];
		const data = 'a'.repeat(MAX_OFFLINE_MESSAGE_BYTES / 2);

		try {
			await server.connected;
			const initialConnects = [];
			while (initialConnects.length < channels.length) {
				initialConnects.push(await server.nextMessage);
			}
			server.close();

			stream.send('generic', { marker: 'old' });
			stream.send('generic', { marker: 'first', data });
			stream.send('generic', { marker: 'second', data });

			server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
			await server.connected;
			for (const connect of initialConnects) {
				expect(await server.nextMessage).toEqual(connect);
			}
			expect(await server.nextMessage).toEqual({ type: 'generic', body: { marker: 'second', data } });
		} finally {
			stream.close();
			server.close();
		}
	});

	test('不正な受信メッセージを_error_として通知する', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const errors: Error[] = [];
		stream.on('_error_', error => errors.push(error));

		try {
			await server.connected;
			server.send('{');
			server.send(JSON.stringify([]));
			server.send(JSON.stringify({ type: 'channel', body: { id: 1, type: 'event' } }));

			expect(errors.map(error => error.message)).toEqual([
				'Failed to parse streaming message as JSON',
				'Invalid streaming message envelope',
				'Invalid streaming channel message',
			]);
		} finally {
			stream.close();
			server.close();
		}
	});

	test('予約済みローカルイベント名をwireから配送しない', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const errors: Error[] = [];
		let connected = 0;
		stream.on('_error_', error => errors.push(error));
		stream.on('_connected_', () => connected++);

		try {
			await server.connected;
			expect(connected).toBe(1);

			server.send({ type: '_error_', body: 'not an Error' });
			server.send({ type: '_connected_', body: null });

			expect(connected).toBe(1);
			expect(errors).toHaveLength(2);
			expect(errors.every(error => error instanceof Error)).toBe(true);
			expect(errors.map(error => error.message)).toEqual([
				'Reserved streaming event type received: _error_',
				'Reserved streaming event type received: _connected_',
			]);
		} finally {
			stream.close();
			server.close();
		}
	});

	test('未知のトップレベルイベントは互換性のため配送する', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const received: unknown[] = [];
		const on = stream.on as unknown as (event: string, listener: (payload: unknown) => void) => Stream;
		on.call(stream, 'futureEvent', payload => received.push(payload));

		try {
			await server.connected;
			server.send({ type: 'futureEvent', body: { value: 1 } });

			expect(received).toEqual([{ value: 1 }]);
		} finally {
			stream.close();
			server.close();
		}
	});

	test('未知のconnected IDを接続済みとして記録しない', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		stream.useChannel('main');

		try {
			await server.connected;
			await server.nextMessage;
			server.send({ type: 'connected', body: { id: '2' } });

			const chat = stream.useChannel('chat', { other: 'aaa' });
			const connect = await server.nextMessage as { type: string; body: { id: string; }; };
			let ready = false;
			void chat.ready.then(() => {
				ready = true;
			});
			await Promise.resolve();

			expect(connect.body.id).toBe('2');
			expect(ready).toBe(false);

			server.send({ type: 'connected', body: { id: '2' } });
			await chat.ready;
			expect(ready).toBe(true);
		} finally {
			stream.close();
			server.close();
		}
	});

	test('未接続時の send は例外を投げずにキューされる', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		await server.connected;
		server.close();

		// 切断直後 (再接続前) の送信が例外にならないこと
		expect(() => stream.heartbeat()).not.toThrow();

		stream.close();
	});

	test('最後の共有接続をdisposeして3秒経つとdisconnectする', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const main = stream.useChannel('main');

		try {
			await server.connected;
			const connect = await server.nextMessage as { type: string; body: { id: string; channel: string; }; };
			expect(connect.type).toBe('connect');

			vi.useFakeTimers();
			main.dispose();
			await vi.advanceTimersByTimeAsync(2999);
			expect(server).toHaveReceivedMessages([connect]);

			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(10);
			expect(server).toHaveReceivedMessages([
				connect,
				{ type: 'disconnect', body: { id: connect.body.id } },
			]);
		} finally {
			vi.useRealTimers();
			stream.close();
			server.close();
		}
	});

	test('同じチャンネルの共有接続を使い回す', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const receivedByFirst: unknown[] = [];
		const receivedBySecond: unknown[] = [];
		const first = stream.useChannel('main');
		const second = stream.useChannel('main');
		first.on('meUpdated', payload => receivedByFirst.push(payload));
		second.on('meUpdated', payload => receivedBySecond.push(payload));

		try {
			await server.connected;
			const connect = await server.nextMessage as { type: string; body: { id: string; channel: string; }; };
			expect(connect.type).toBe('connect');
			expect(connect.body.channel).toBe('main');
			expect(first.id).toBe(connect.body.id);
			expect(second.id).toBe(connect.body.id);
			expect(server).toHaveReceivedMessages([connect]);

			const payload = { id: 'foo' };
			server.send({
				type: 'channel',
				body: {
					id: connect.body.id,
					type: 'meUpdated',
					body: payload,
				},
			});
			expect(receivedByFirst).toEqual([payload]);
			expect(receivedBySecond).toEqual([payload]);
		} finally {
			first.dispose();
			second.dispose();
			stream.close();
			server.close();
		}
	});

	test('共有接続のdisposeは冪等で、再利用後も正常に切断する', async () => {
		const server = new WS('wss://misskey.test/streaming', { jsonProtocol: true });
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const first = stream.useChannel('main');
		let reused: ReturnType<typeof stream.useChannel> | undefined;

		try {
			await server.connected;
			const connect = await server.nextMessage as { type: string; body: { id: string; channel: string; }; };
			vi.useFakeTimers();

			first.dispose();
			first.dispose();
			await vi.advanceTimersByTimeAsync(2999);

			reused = stream.useChannel('main');
			expect(reused.id).toBe(connect.body.id);
			await vi.advanceTimersByTimeAsync(20);
			expect(server).toHaveReceivedMessages([connect]);

			reused.dispose();
			await vi.advanceTimersByTimeAsync(3010);
			expect(server).toHaveReceivedMessages([
				connect,
				{ type: 'disconnect', body: { id: connect.body.id } },
			]);
		} finally {
			vi.useRealTimers();
			reused?.dispose();
			stream.close();
			server.close();
		}
	});
});
