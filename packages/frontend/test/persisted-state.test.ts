/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp } from 'vue';
import { createPinia, defineStore } from 'pinia';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PersistedStateChannel, PersistedStateDefinition, PersistedStateIo } from '@/store/persisted-state.js';
import { createPersistedStatePlugin } from '@/store/persisted-state.js';

class ChannelHub {
	private readonly channels = new Map<string, Set<TestChannel>>();

	public create(name: string): TestChannel {
		const channel = new TestChannel(name, this);
		const channels = this.channels.get(name) ?? new Set();
		channels.add(channel);
		this.channels.set(name, channels);
		return channel;
	}

	public post(sender: TestChannel, name: string, message: unknown): void {
		for (const channel of this.channels.get(name) ?? []) {
			if (channel === sender) continue;
			channel.receive(message);
		}
	}

	public close(channel: TestChannel, name: string): void {
		this.channels.get(name)?.delete(channel);
	}
}

class TestChannel implements PersistedStateChannel {
	private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

	constructor(
		private readonly name: string,
		private readonly hub: ChannelHub,
	) {}

	public postMessage(message: Parameters<PersistedStateChannel['postMessage']>[0]): void {
		this.hub.post(this, this.name, message);
	}

	public addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
		this.listeners.add(listener);
	}

	public removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
		this.listeners.delete(listener);
	}

	public close(): void {
		this.hub.close(this, this.name);
	}

	public receive(message: unknown): void {
		for (const listener of this.listeners) listener(new MessageEvent('message', { data: message }));
	}
}

type TestIoOptions = {
	sourceId: string;
	accountId?: string | null;
	storage?: Map<string, unknown>;
	accountValues?: Record<string, unknown> | Promise<Record<string, unknown>>;
	hub?: ChannelHub;
};

function createTestIo(options: TestIoOptions) {
	const storage = options.storage ?? new Map<string, unknown>();
	const hub = options.hub ?? new ChannelHub();
	const setCalls: [string, unknown][] = [];
	const accountSetCalls: [string, string, unknown][] = [];
	const io: PersistedStateIo = {
		sourceId: options.sourceId,
		currentAccountId: () => options.accountId ?? null,
		get: async (key) => storage.get(key),
		set: async (key, value) => {
			setCalls.push([key, value]);
			storage.set(key, value);
		},
		update: async (key, updater) => {
			const value = updater(storage.get(key));
			setCalls.push([key, value]);
			storage.set(key, value);
		},
		loadAccount: async () => options.accountValues ?? {},
		saveAccount: async (namespace, key, value) => {
			accountSetCalls.push([namespace, key, value]);
		},
		createChannel: (name) => hub.create(name),
	};
	return { io, storage, setCalls, accountSetCalls, hub };
}

function createStore<S extends Record<string, unknown>>(
	id: string,
	state: () => S,
	persist: PersistedStateDefinition<S>,
	io: PersistedStateIo,
) {
	const pinia = createPinia().use(createPersistedStatePlugin(io));
	createApp({}).use(pinia);
	const useStore = defineStore(id, { state, persist });
	return useStore(pinia);
}

describe('Pinia persisted state plugin', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('hydrates persisted state and merges new default object fields', async () => {
		const storage = new Map([['pinia::test::device', { nested: { existing: true } }]]);
		const fixture = createTestIo({ sourceId: 'tab-a', storage });
		const store = createStore(
			'persisted-hydration',
			() => ({ nested: { existing: false, addedLater: true } }),
			{
				namespace: 'test',
				properties: { nested: { where: 'device' } },
			},
			fixture.io,
		);

		await store.$persistReady;

		expect(store.nested).toEqual({ existing: true, addedLater: true });
		expect(fixture.storage.get('pinia::test::device')).toEqual({ nested: { existing: true } });
	});

	test('batches same-tick writes into one storage operation', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a' });
		const store = createStore(
			'batched-writes',
			() => ({ first: 0, second: 0 }),
			{
				namespace: 'batch',
				properties: {
					first: { where: 'device' },
					second: { where: 'device' },
				},
			},
			fixture.io,
		);
		await store.$persistReady;

		store.$patch({ first: 1, second: 2 });
		await store.$persistFlush();

		expect(fixture.setCalls).toHaveLength(1);
		expect(fixture.storage.get('pinia::batch::device')).toEqual({ first: 1, second: 2 });
	});

	test('preserves different keys written concurrently by multiple tabs', async () => {
		const storage = new Map<string, unknown>();
		const hub = new ChannelHub();
		const firstFixture = createTestIo({ sourceId: 'tab-a', storage, hub });
		const secondFixture = createTestIo({ sourceId: 'tab-b', storage, hub });
		const persist = {
			namespace: 'concurrent',
			properties: {
				first: { where: 'device' },
				second: { where: 'device' },
			},
		} as const;
		const first = createStore('concurrent-first', () => ({ first: 0, second: 0 }), persist, firstFixture.io);
		const second = createStore('concurrent-second', () => ({ first: 0, second: 0 }), persist, secondFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady]);

		first.first = 1;
		second.second = 2;
		await Promise.all([first.$persistFlush(), second.$persistFlush()]);

		expect(storage.get('pinia::concurrent::device')).toEqual({ first: 1, second: 2 });
	});

	test('coalesces a burst of writes to the latest value', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a' });
		const store = createStore(
			'burst-writes',
			() => ({ value: 0 }),
			{
				namespace: 'burst',
				properties: { value: { where: 'device' } },
			},
			fixture.io,
		);
		await store.$persistReady;

		for (let i = 1; i <= 100; i++) store.$patch({ value: i });
		await store.$persistFlush();

		expect(fixture.setCalls).toHaveLength(1);
		expect(fixture.storage.get('pinia::burst::device')).toEqual({ value: 100 });
	});

	test('continues processing writes after a storage failure', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a' });
		const update = fixture.io.update;
		let shouldFail = true;
		fixture.io.update = async (key, updater) => {
			if (key === 'pinia::recovery::device' && shouldFail) {
				shouldFail = false;
				throw new Error('storage unavailable');
			}
			await update(key, updater);
		};
		const store = createStore(
			'write-recovery',
			() => ({ value: 0 }),
			{
				namespace: 'recovery',
				properties: { value: { where: 'device' } },
			},
			fixture.io,
		);
		await store.$persistReady;

		store.value = 1;
		await expect(store.$persistFlush()).rejects.toThrow('storage unavailable');
		store.value = 2;
		await expect(store.$persistFlush()).resolves.toBeUndefined();

		expect(fixture.storage.get('pinia::recovery::device')).toEqual({ value: 2 });
	});

	test('syncs device-account state only to tabs using the same account', async () => {
		const hub = new ChannelHub();
		const storage = new Map<string, unknown>();
		const firstFixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a', hub, storage });
		const secondFixture = createTestIo({ sourceId: 'tab-b', accountId: 'account-a', hub, storage });
		const otherFixture = createTestIo({ sourceId: 'tab-c', accountId: 'account-b', hub, storage });
		const persist = {
			namespace: 'account-sync',
			properties: { value: { where: 'deviceAccount' } },
		} as const;
		const first = createStore('account-sync-first', () => ({ value: 0 }), persist, firstFixture.io);
		const second = createStore('account-sync-second', () => ({ value: 0 }), persist, secondFixture.io);
		const other = createStore('account-sync-other', () => ({ value: 0 }), persist, otherFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady, other.$persistReady]);

		first.value = 42;
		await first.$persistFlush();

		expect(second.value).toBe(42);
		expect(other.value).toBe(0);
		expect(
			secondFixture.setCalls.filter(([key]) => key === 'pinia::account-sync::device-account::account-a'),
		).toHaveLength(0);
		expect(
			otherFixture.setCalls.filter(([key]) => key === 'pinia::account-sync::device-account::account-b'),
		).toHaveLength(0);
	});

	test('orders a local update after the latest remote update even when clocks are equal', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1000);
		const hub = new ChannelHub();
		const storage = new Map<string, unknown>();
		const firstFixture = createTestIo({ sourceId: 'tab-z', hub, storage });
		const secondFixture = createTestIo({ sourceId: 'tab-a', hub, storage });
		const persist = {
			namespace: 'ordered-sync',
			properties: { value: { where: 'device' } },
		} as const;
		const first = createStore('ordered-sync-first', () => ({ value: 0 }), persist, firstFixture.io);
		const second = createStore('ordered-sync-second', () => ({ value: 0 }), persist, secondFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady]);

		first.value = 1;
		await first.$persistFlush();
		second.value = 2;
		await second.$persistFlush();

		expect(first.value).toBe(2);
		expect(second.value).toBe(2);
	});

	test('does not overwrite a local account change with a late cloud response', async () => {
		let resolveAccountValues!: (value: Record<string, unknown>) => void;
		const accountValues = new Promise<Record<string, unknown>>((resolve) => {
			resolveAccountValues = resolve;
		});
		const fixture = createTestIo({
			sourceId: 'tab-a',
			accountId: 'account-a',
			accountValues,
		});
		const store = createStore(
			'late-cloud',
			() => ({ value: 'default' }),
			{
				namespace: 'late-cloud',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistReady;

		store.value = 'local';
		resolveAccountValues({ value: 'remote' });
		await store.$persistLoaded;
		await store.$persistFlush();

		expect(store.value).toBe('local');
		expect(fixture.storage.get('pinia::late-cloud::account-cache::account-a')).toEqual({ value: 'local' });
		expect(fixture.accountSetCalls).toEqual([['late-cloud', 'value', 'local']]);
	});

	test('reports cloud hydration failures without leaving loaded pending', async () => {
		const onError = vi.fn();
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		fixture.io.loadAccount = async () => {
			throw new Error('offline');
		};
		fixture.io.onError = onError;
		const store = createStore(
			'cloud-error',
			() => ({ value: 'cached' }),
			{
				namespace: 'cloud-error',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);

		await expect(store.$persistLoaded).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledOnce();
	});
});
