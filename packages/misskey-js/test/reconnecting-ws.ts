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
		this.sent.push(data);
	}

	public close(): void {}

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
});
