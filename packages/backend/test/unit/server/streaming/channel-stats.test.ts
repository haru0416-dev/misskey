/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { globalEventBus } from '@/misc/global-event-bus.js';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { StreamConnection } from '@/server/streaming/connection.js';
import type { StreamConnectionDependencies } from '@/server/streaming/connection.js';

function collectSentMessages(): { raw: string[]; send: (raw: string) => void } {
	const raw: string[] = [];
	return { raw, send: (r: string) => raw.push(r) };
}

function channelMessages(raw: string[]): { id: string; type: string; body: unknown }[] {
	return raw
		.map((r) => JSON.parse(r))
		.filter((m) => m.type === 'channel')
		.map((m) => m.body);
}

// globalEventBus はプロセス内シングルトンなので、チャンネル側と同じインスタンスを
// 直接importして発行できる。実際のデーモン (queue-stats.ts 等) を起動せずに
// チャンネル側の購読・転送ロジックだけを検証する。
const testEv = globalEventBus;

async function waitUntil(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
	await vi.waitFor(() => expect(condition()).toBe(true), { timeout: timeoutMs, interval: intervalMs });
}

describe('hono-stream-connection: stats channels', () => {
	let runtime: RuntimeDependencies;
	let deps: StreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('queueStats: 未ログインでも接続でき、queueStatsイベントを受け取れる', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'queueStats', false);

		testEv.emit('queueStats', { deliver: { active: 1 }, inbox: { active: 2 } });
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages).toHaveLength(1);
		expect((messages[0] as { type: string }).type).toBe('stats');
	});

	test('queueStats: requestLog要求に対しstatsLogを返す', async () => {
		// 実際にはデーモン (server/daemons/queue-stats.ts) が 'requestQueueStatsLog' を購読して
		// 'queueStatsLog:<id>' で応答する。ここではデーモンを起動しないため、その応答側を模擬する。
		const log = [{ deliver: { active: 3 }, inbox: { active: 4 } }];
		const onRequest = vi.fn((x: { id: string; length?: number }) => {
			testEv.emit(`queueStatsLog:${x.id}`, log);
		});
		testEv.on('requestQueueStatsLog', onRequest);
		const connection = new StreamConnection(deps, null, null);

		try {
			await connection.init();
			const subscriber = new EventEmitter();
			const { raw, send } = collectSentMessages();
			connection.listen(subscriber, send);

			await connection.connectChannel('conn1', {}, 'queueStats', false);
			connection.handleClientMessage(
				JSON.stringify({
					type: 'channel',
					body: { id: 'conn1', type: 'requestLog', body: { id: 'req1', length: 10 } },
				}),
			);

			await waitUntil(() => channelMessages(raw).some((m) => m.type === 'statsLog'));

			expect(onRequest).toHaveBeenCalledOnce();
			expect(onRequest).toHaveBeenCalledWith({ id: 'req1', length: 10 });
			expect(channelMessages(raw)).toEqual([{ id: 'conn1', type: 'statsLog', body: log }]);
		} finally {
			testEv.off('requestQueueStatsLog', onRequest);
			connection.dispose();
		}
	});

	test('serverStats: 未ログインでもイベントを受け取り、切断後は購読を解放する', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		const listenersBefore = testEv.listeners('serverStats');
		try {
			await connection.connectChannel('conn1', {}, 'serverStats', false);

			testEv.emit('serverStats', { cpu: 0.1, mem: { used: 1, active: 1 }, net: { rx: 0, tx: 0 }, fs: { r: 0, w: 0 } });
			await waitUntil(() => channelMessages(raw).length > 0);

			const messages = channelMessages(raw);
			expect(messages).toHaveLength(1);
			expect(messages[0]?.type).toBe('stats');
			connection.disconnectChannel('conn1');
			expect(testEv.listeners('serverStats')).toEqual(listenersBefore);
			raw.length = 0;
			testEv.emit('serverStats', { cpu: 0.2, mem: { used: 1, active: 1 }, net: { rx: 0, tx: 0 }, fs: { r: 0, w: 0 } });
			expect(channelMessages(raw)).toEqual([]);
		} finally {
			connection.dispose();
		}
	});
});
