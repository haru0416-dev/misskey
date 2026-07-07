import { describe, test, expect } from 'vitest';
import WS from 'vitest-websocket-mock';
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

	test('未接続時の send は例外を投げずに破棄される', async () => {
		const server = new WS('wss://misskey.test/streaming');
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		await server.connected;
		server.close();

		// 切断直後 (再接続前) の送信が例外にならないこと
		expect(() => stream.heartbeat()).not.toThrow();

		stream.close();
	});

	// TODO: SharedConnection#dispose して一定時間経ったら disconnect メッセージがサーバーに送られてくるかのテスト

	// TODO: チャンネル接続が使いまわされるかのテスト
});
