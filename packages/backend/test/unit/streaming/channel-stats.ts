/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { globalEventBus } from '@/misc/global-event-bus.js';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { HonoStreamConnection, type HonoStreamConnectionDependencies } from '@/server/streaming/connection.js';

function collectSentMessages(): { raw: string[]; send: (raw: string) => void } {
	const raw: string[] = [];
	return { raw, send: (r: string) => raw.push(r) };
}

function channelMessages(raw: string[]): { id: string; type: string; body: unknown }[] {
	return raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel').map(m => m.body);
}

// globalEventBus はプロセス内シングルトンなので、チャンネル側と同じインスタンスを
// 直接importして発行できる。実際のデーモン (queue-stats.ts 等) を起動せずに
// チャンネル側の購読・転送ロジックだけを検証する。
const testEv = globalEventBus;

async function waitUntil(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) return;
		await new Promise(resolve => setTimeout(resolve, intervalMs));
	}
}

describe('hono-stream-connection: stats channels', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoStreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('queueStats: 未ログインでも接続でき、queueStatsイベントを受け取れる', async () => {
		const connection = new HonoStreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'queueStats', false);

		testEv.emit('queueStats', { deliver: { active: 1 }, inbox: { active: 2 } });
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages.length).toBe(1);
		expect((messages[0] as { type: string }).type).toBe('stats');
	});

	test('queueStats: requestLog要求に対しstatsLogを返す', async () => {
		// 実際にはデーモン (hono-daemon-queue-stats.ts) が 'requestQueueStatsLog' を購読して
		// 'queueStatsLog:<id>' で応答する。ここではデーモンを起動しないため、その応答側を模擬する。
		const onRequest = (x: { id: string; length?: number }) => {
			testEv.emit(`queueStatsLog:${x.id}`, [{ deliver: {}, inbox: {} }]);
		};
		testEv.on('requestQueueStatsLog', onRequest);

		try {
			const connection = new HonoStreamConnection(deps, null, null);
			await connection.init();
			const subscriber = new EventEmitter();
			const { raw, send } = collectSentMessages();
			connection.listen(subscriber, send);

			await connection.connectChannel('conn1', {}, 'queueStats', false);
			connection.handleClientMessage(JSON.stringify({
				type: 'channel',
				body: { id: 'conn1', type: 'requestLog', body: { id: 'req1', length: 10 } },
			}));

			await waitUntil(() => channelMessages(raw).some(m => (m as { type: string }).type === 'statsLog'));

			const statsLog = channelMessages(raw).find(m => (m as { type: string }).type === 'statsLog');
			expect(statsLog).not.toBeUndefined();
		} finally {
			testEv.off('requestQueueStatsLog', onRequest);
		}
	});

	test('serverStats: 未ログインでも接続でき、serverStatsイベントを受け取れる', async () => {
		const connection = new HonoStreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'serverStats', false);

		testEv.emit('serverStats', { cpu: 0.1, mem: { used: 1, active: 1 }, net: { rx: 0, tx: 0 }, fs: { r: 0, w: 0 } });
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages.length).toBe(1);
		expect((messages[0] as { type: string }).type).toBe('stats');
	});

	test('serverStats: dispose後はイベントを受け取らない', async () => {
		const connection = new HonoStreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'serverStats', false);
		connection.disconnectChannel('conn1');

		testEv.emit('serverStats', { cpu: 0.2, mem: { used: 1, active: 1 }, net: { rx: 0, tx: 0 }, fs: { r: 0, w: 0 } });
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(channelMessages(raw).length).toBe(0);
	});
});
