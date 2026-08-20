import { describe, expect, test } from 'vitest';
import { MAX_OFFLINE_MESSAGE_BYTES, MAX_OFFLINE_MESSAGE_COUNT, ReconnectingWebSocket } from '../src/reconnecting-ws.js';

class FakeWebSocket {
	public static instances: FakeWebSocket[] = [];
	public binaryType = 'blob';
	public readyState = 0;
	public onopen: ((event: unknown) => void) | null = null;
	public onclose: ((event: unknown) => void) | null = null;
	public onmessage: ((event: unknown) => void) | null = null;
	public onerror: ((event: unknown) => void) | null = null;
	public sent: string[] = [];

	constructor() {
		FakeWebSocket.instances.push(this);
	}

	public send(data: string): void {
		if (this.readyState !== 1) throw new Error(`send while socket state is ${this.readyState}`);
		this.sent.push(data);
	}

	public close(): void {
		this.readyState = 2;
	}

	public open(): void {
		this.readyState = 1;
		this.onopen?.({});
	}
}

describe('ReconnectingWebSocket', () => {
	test('keeps only the newest offline messages within the count limit', () => {
		FakeWebSocket.instances = [];
		const socket = new ReconnectingWebSocket('wss://example.test', undefined, { WebSocket: FakeWebSocket });
		const ws = FakeWebSocket.instances[0]!;

		for (let i = 0; i <= MAX_OFFLINE_MESSAGE_COUNT; i++) socket.send(String(i));
		ws.open();

		expect(ws.sent).toHaveLength(MAX_OFFLINE_MESSAGE_COUNT);
		expect(ws.sent[0]).toBe('1');
		expect(ws.sent.at(-1)).toBe(String(MAX_OFFLINE_MESSAGE_COUNT));
		socket.close();
	});

	test('keeps only the newest offline messages within the byte limit', () => {
		FakeWebSocket.instances = [];
		const socket = new ReconnectingWebSocket('wss://example.test', undefined, { WebSocket: FakeWebSocket });
		const ws = FakeWebSocket.instances[0]!;
		const halfLimit = 'a'.repeat(MAX_OFFLINE_MESSAGE_BYTES / 2);

		socket.send('old');
		socket.send(halfLimit);
		socket.send(halfLimit);
		ws.open();

		expect(ws.sent).toEqual([halfLimit, halfLimit]);
		socket.close();
	});

	test('sends messages from open listeners before flushing the offline queue', () => {
		FakeWebSocket.instances = [];
		const socket = new ReconnectingWebSocket('wss://example.test', undefined, { WebSocket: FakeWebSocket });
		const ws = FakeWebSocket.instances[0]!;

		socket.send('normal-1');
		socket.send('normal-2');
		socket.addEventListener('open', () => {
			socket.send('open-1');
			socket.send('open-2');
		});
		ws.open();

		expect(ws.sent).toEqual(['open-1', 'open-2', 'normal-1', 'normal-2']);
		socket.close();
	});

	test('does not flush queued messages when an open listener closes the socket', () => {
		FakeWebSocket.instances = [];
		const socket = new ReconnectingWebSocket('wss://example.test', undefined, { WebSocket: FakeWebSocket });
		const ws = FakeWebSocket.instances[0]!;
		socket.send('queued');
		socket.addEventListener('open', () => socket.close());

		expect(() => ws.open()).not.toThrow();
		expect(ws.sent).toEqual([]);
	});

	test('flushes queued messages before rethrowing an open listener error', () => {
		FakeWebSocket.instances = [];
		const socket = new ReconnectingWebSocket('wss://example.test', undefined, { WebSocket: FakeWebSocket });
		const ws = FakeWebSocket.instances[0]!;
		socket.send('queued');
		socket.addEventListener('open', () => {
			throw new Error('listener failed');
		});

		expect(() => ws.open()).toThrow('listener failed');
		expect(ws.sent).toEqual(['queued']);
		socket.close();
	});
});
