/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import XCpuMemory from '@/widgets/server-metric/cpu-mem.vue';
import XNet from '@/widgets/server-metric/net.vue';

type Connection = Misskey.IChannelConnection<Misskey.Channels['serverStats']>;

function createConnection() {
	const listeners = new Map<string, Set<(payload: never) => void>>();
	const sent: { type: string; payload: unknown }[] = [];
	const connection = {
		on: (type: string, listener: (payload: never) => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(listener);
		},
		off: (type: string, listener: (payload: never) => void) => {
			listeners.get(type)?.delete(listener);
		},
		send: (type: string, payload: unknown) => {
			sent.push({ type, payload });
		},
	} as unknown as Connection;
	const emit = (type: string, payload: unknown) => {
		for (const listener of listeners.get(type) ?? []) (listener as (payload: unknown) => void)(payload);
	};
	const listenerCount = (type: string) => listeners.get(type)?.size ?? 0;
	return { connection, sent, emit, listenerCount };
}

const meta = { mem: { total: 1000 } } as Misskey.entities.ServerInfoResponse;

function createStats(cpu: number, active: number, rx: number, tx: number): Misskey.entities.ServerStats {
	return {
		cpu,
		mem: { used: active, active },
		net: { rx, tx },
		fs: { r: 0, w: 0 },
	} as Misskey.entities.ServerStats;
}

describe('server metric widget', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('requests the log on mount, draws incoming stats, and unsubscribes on unmount', async () => {
		const { connection, sent, emit, listenerCount } = createConnection();
		const result = render(XCpuMemory, { props: { connection, meta } });

		expect(sent).toHaveLength(1);
		expect(sent[0]!.type).toBe('requestLog');
		expect(sent[0]!.payload).toMatchObject({ length: 50 });
		expect(listenerCount('stats')).toBe(1);
		expect(listenerCount('statsLog')).toBe(1);

		// statsLog は新しい順で届くので、逆順に流し込まれて末尾が最新になる。
		emit('statsLog', [createStats(0.5, 400, 0, 0), createStats(0.1, 200, 0, 0)]);
		emit('stats', createStats(0.75, 600, 0, 0));
		await nextTick();

		const polylines = [...result.container.querySelectorAll('polyline')];
		expect(polylines).toHaveLength(2);
		expect(polylines[0]!.getAttribute('points')?.split(' ')).toHaveLength(3);
		expect(result.container.textContent).toContain('75%');
		expect(result.container.textContent).toContain('60%');

		result.unmount();
		expect(listenerCount('stats')).toBe(0);
		expect(listenerCount('statsLog')).toBe(0);
	});

	test('net view subscribes through the same composable', async () => {
		const { connection, sent, emit, listenerCount } = createConnection();
		const result = render(XNet, { props: { connection, meta } });

		expect(sent[0]!.type).toBe('requestLog');

		emit('stats', createStats(0, 0, 1024, 2048));
		await nextTick();

		const polylines = [...result.container.querySelectorAll('polyline')];
		expect(polylines).toHaveLength(2);
		expect(polylines[0]!.getAttribute('points')).not.toBe('');

		result.unmount();
		expect(listenerCount('stats')).toBe(0);
	});
});
