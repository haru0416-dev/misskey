/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp } from 'vue';
import { createPinia, defineStore } from 'pinia';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PersistedStateChannel, PersistedStateDefinition, PersistedStateIo } from '@/store/persisted-state.js';
import { createPersistedStatePlugin, replacePersistedStateProperty } from '@/store/persisted-state.js';

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
			if (channel === sender) {
				continue;
			}
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
		for (const listener of this.listeners) {
			listener(new MessageEvent('message', { data: message }));
		}
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

	test('batches same-tick writes to different keys and retains the latest value', async () => {
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

		store.$patch({ first: 1 });
		store.$patch({ first: 2 });
		store.$patch({ second: 3 });
		await store.$persistFlush();

		expect(fixture.setCalls).toHaveLength(1);
		expect(fixture.storage.get('pinia::batch::device')).toEqual({ first: 2, second: 3 });
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

	test('keeps queued persistence and broadcasts bound to the originating account', async () => {
		const options: TestIoOptions = { sourceId: 'tab-a', accountId: 'account-a' };
		const fixture = createTestIo(options);
		const persist = {
			namespace: 'switch-pending',
			properties: { value: { where: 'deviceAccount' } },
		} as const;
		const first = createStore('switch-first', () => ({ value: 0 }), persist, fixture.io);
		const secondFixture = createTestIo({
			sourceId: 'tab-b',
			accountId: 'account-a',
			hub: fixture.hub,
			storage: fixture.storage,
		});
		const second = createStore('switch-second', () => ({ value: 0 }), persist, secondFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady]);
		first.value = 42;
		options.accountId = 'account-b';
		await first.$persistFlush();
		expect(fixture.storage.get('pinia::switch-pending::device-account::account-a')).toEqual({ value: 42 });
		expect(fixture.storage.has('pinia::switch-pending::device-account::account-b')).toBe(false);
		expect(second.value).toBe(42);
		await Promise.all([first.$persistDispose(), second.$persistDispose()]);
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
		const { promise: accountValues, resolve: resolveAccountValues } = Promise.withResolvers<Record<string, unknown>>();
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

	test('does not hydrate local state after its selected account owner changes', async () => {
		const local = Promise.withResolvers<Record<string, unknown>>();
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		let current = true;
		fixture.io.isCurrent = () => current;
		fixture.io.get = async () => local.promise;
		const store = createStore(
			'local-account-cutover',
			() => ({ value: 'initial' }),
			{
				namespace: 'local-account-cutover',
				properties: { value: { where: 'device' } },
			},
			fixture.io,
		);
		const failure = store.$persistReady.then(
			() => {
				throw new Error('Unselected owner unexpectedly became ready');
			},
			() => {},
		);
		current = false;
		local.resolve({ value: 'old-account-value' });
		await failure;
		await store.$persistLoaded;

		expect(store.value).toBe('initial');
		expect(fixture.storage.size).toBe(0);
		expect(fixture.accountSetCalls).toEqual([]);
		await store.$persistDispose();
	});

	test('does not start a registry request if the selected owner changes after the cache write', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		let current = true;
		fixture.io.isCurrent = () => current;
		const cached = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const update = fixture.io.update;
		let hold = false;
		fixture.io.update = async (key, updater) => {
			await update(key, updater);
			if (hold && key.includes('::account-cache::')) {
				cached.resolve();
				await release.promise;
			}
		};
		const store = createStore(
			'registry-account-cutover',
			() => ({ value: 'initial' }),
			{
				namespace: 'registry-account-cutover',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;
		hold = true;
		store.value = 'changed';
		const failure = store.$persistFlush().then(
			() => {
				throw new Error('Unselected owner unexpectedly saved');
			},
			() => {},
		);
		await cached.promise;
		current = false;
		fixture.storage.clear();
		release.resolve();
		await failure;

		expect(fixture.accountSetCalls).toEqual([]);
		expect(fixture.storage.size).toBe(0);
		await store.$persistDispose();
	});

	test('rejects a delayed peer write after its selected account owner changes', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		let current = true;
		fixture.io.isCurrent = () => current;
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const update = fixture.io.update;
		fixture.io.update = async (key, updater) => {
			if (key.endsWith('::device')) {
				started.resolve();
				await release.promise;
			}
			await update(key, updater);
		};
		const store = createStore(
			'peer-account-cutover',
			() => ({ tokens: {} as Record<string, string> }),
			{
				namespace: 'peer-account-cutover',
				properties: { tokens: { where: 'device' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;
		replacePersistedStateProperty(store, 'tokens', { old: 'old-token' });
		const failure = store.$persistFlush().then(
			() => {
				throw new Error('Unselected owner unexpectedly saved');
			},
			() => {},
		);
		await started.promise;
		current = false;
		fixture.storage.clear();
		release.resolve();
		await failure;

		expect(fixture.storage.size).toBe(0);
		expect(() => replacePersistedStateProperty(store, 'tokens', { old: 'another-token' })).toThrow();
		await expect(store.$persistFlush()).rejects.toThrow();
		await store.$persistDispose();
	});

	test('does not accept account hydration after the selected owner changes', async () => {
		const values = Promise.withResolvers<Record<string, unknown>>();
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a', accountValues: values.promise });
		let current = true;
		fixture.io.isCurrent = () => current;
		const onError = vi.fn();
		fixture.io.onError = onError;
		const store = createStore(
			'hydrate-account-cutover',
			() => ({ value: 'initial' }),
			{
				namespace: 'hydrate-account-cutover',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistReady;
		current = false;
		fixture.storage.clear();
		values.resolve({ value: 'old-account-value' });
		await store.$persistLoaded;

		expect(store.value).toBe('initial');
		expect(fixture.storage.size).toBe(0);
		expect(onError).toHaveBeenCalledOnce();
		await store.$persistDispose();
	});

	test('drains every initialization read before disposal even when another read fails', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		const releaseRead = Promise.withResolvers<void>();
		const onError = vi.fn();
		fixture.io.onError = onError;
		fixture.io.get = async (key) => {
			if (key.endsWith('::device')) throw new Error('local read failed');
			if (key.includes('::device-account::')) await releaseRead.promise;
			return {};
		};
		const store = createStore(
			'terminal-initialization',
			() => ({ value: 'initial' }),
			{
				namespace: 'terminal-initialization',
				properties: { value: { where: 'device' } },
			},
			fixture.io,
		);
		const failure = store.$persistReady.then(
			() => {
				throw new Error('Failed initialization unexpectedly became ready');
			},
			() => {},
		);
		let drained = false;
		const disposed = store.$persistDispose().then(() => {
			drained = true;
		});
		const checkpoint = Promise.withResolvers<void>();
		const channel = new MessageChannel();
		channel.port1.onmessage = () => checkpoint.resolve();
		channel.port2.postMessage(null);
		await checkpoint.promise;
		channel.port1.close();
		channel.port2.close();
		expect(drained).toBe(false);
		expect(onError).not.toHaveBeenCalled();

		releaseRead.resolve();
		await Promise.all([failure, disposed]);
		expect(onError).toHaveBeenCalledOnce();
		expect(fixture.storage.size).toBe(0);
	});

	test('removes stale cached account fields absent from the loaded registry', async () => {
		const storage = new Map<string, unknown>([
			['pinia::absent-account-value::account-cache::account-a', { value: 'stale' }],
		]);
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a', storage, accountValues: {} });
		const store = createStore(
			'absent-account-value',
			() => ({ value: 'default' }),
			{
				namespace: 'absent-account-value',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;

		expect(store.value).toBe('default');
		expect(storage.get('pinia::absent-account-value::account-cache::account-a')).toEqual({});
		await store.$persistDispose();
	});

	test('retries an unchanged failed registry save without losing the cached value', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		const save = fixture.io.saveAccount;
		let attempts = 0;
		fixture.io.saveAccount = async (namespace, key, value) => {
			if (++attempts === 1) throw new Error('registry offline');
			await save(namespace, key, value);
		};
		const store = createStore(
			'registry-retry',
			() => ({ value: 'initial' }),
			{
				namespace: 'registry-retry',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;
		store.value = 'changed';
		await expect(store.$persistFlush()).rejects.toThrow('registry offline');
		expect(fixture.storage.get('pinia::registry-retry::account-cache::account-a')).toEqual({ value: 'changed' });
		expect(attempts).toBe(1);

		await store.$persistFlush();
		expect(fixture.accountSetCalls).toEqual([['registry-retry', 'value', 'changed']]);
		expect(attempts).toBe(2);
		await store.$persistDispose();
	});

	test('persists direct nested mutations and function patches without retaining deleted fields', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a' });
		const store = createStore(
			'nested-mutations',
			() => ({
				settings: { keep: 'initial', remove: 'remove' } as Record<string, string>,
				other: 0,
			}),
			{
				namespace: 'nested-mutations',
				properties: { settings: { where: 'device' }, other: { where: 'device' } },
			},
			fixture.io,
		);
		await store.$persistReady;

		store.settings['keep'] = 'direct';
		delete store.settings['remove'];
		await store.$persistFlush();
		expect(fixture.storage.get('pinia::nested-mutations::device')).toEqual({ settings: { keep: 'direct' } });
		store.$patch((state) => {
			state.settings['keep'] = 'function';
			state.other = 1;
		});
		await store.$persistFlush();
		expect(fixture.storage.get('pinia::nested-mutations::device')).toEqual({
			settings: { keep: 'function' },
			other: 1,
		});
		await store.$persistDispose();
	});

	test('terminal disposal cancels a delayed local updater without broadcasting it to peers', async () => {
		const hub = new ChannelHub();
		const storage = new Map<string, unknown>();
		const firstFixture = createTestIo({ sourceId: 'tab-a', hub, storage });
		const secondFixture = createTestIo({ sourceId: 'tab-b', hub, storage });
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const update = firstFixture.io.update;
		firstFixture.io.update = async (key, updater) => {
			started.resolve();
			await release.promise;
			await update(key, updater);
		};
		const persist = { namespace: 'terminal-local', properties: { value: { where: 'device' } } } as const;
		const first = createStore('terminal-local-first', () => ({ value: 'initial' }), persist, firstFixture.io);
		const second = createStore('terminal-local-second', () => ({ value: 'initial' }), persist, secondFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady]);
		first.value = 'stale';
		const flush = first.$persistFlush();
		await started.promise;
		const disposed = first.$persistDispose();
		release.resolve();
		await Promise.all([flush, disposed]);
		expect(() => replacePersistedStateProperty(first, 'value', 'after-disposal')).toThrow(
			'Persisted state is disposed',
		);

		expect(storage.get('pinia::terminal-local::device')).toBeUndefined();
		expect(second.value).toBe('initial');
		await second.$persistDispose();
	});

	test('replaces object properties exactly when setting and accepting a peer deletion', async () => {
		const storage = new Map<string, unknown>();
		const hub = new ChannelHub();
		const firstFixture = createTestIo({ sourceId: 'tab-a', storage, hub, accountId: 'account-a' });
		const secondFixture = createTestIo({ sourceId: 'tab-b', storage, hub, accountId: 'account-a' });
		const persist = {
			namespace: 'object-replacement',
			properties: {
				tokens: { where: 'device' },
				settings: { where: 'account' },
			},
		} as const;
		const initial = () => ({
			tokens: { keep: 'keep', remove: 'remove' } as Record<string, string>,
			settings: {} as Record<string, string>,
		});
		const first = createStore('object-replacement-first', initial, persist, firstFixture.io);
		const second = createStore('object-replacement-second', initial, persist, secondFixture.io);
		await Promise.all([first.$persistLoaded, second.$persistLoaded]);

		replacePersistedStateProperty(first, 'tokens', { keep: 'keep' });
		replacePersistedStateProperty(first, 'settings', { keep: 'keep', remove: 'remove' });
		await first.$persistFlush();
		replacePersistedStateProperty(first, 'settings', { keep: 'keep' });
		await first.$persistFlush();

		expect(first.tokens).toEqual({ keep: 'keep' });
		expect(second.tokens).toEqual({ keep: 'keep' });
		expect(first.settings).toEqual({ keep: 'keep' });
		expect(storage.get('pinia::object-replacement::device')).toEqual({ tokens: { keep: 'keep' } });
		expect(storage.get('pinia::object-replacement::account-cache::account-a')).toEqual({ settings: { keep: 'keep' } });
		expect(firstFixture.accountSetCalls.at(-1)).toEqual(['object-replacement', 'settings', { keep: 'keep' }]);
		await Promise.all([first.$persistDispose(), second.$persistDispose()]);
	});

	test('retries an unchanged failed value only after another explicit flush', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a' });
		const update = fixture.io.update;
		const onError = vi.fn();
		fixture.io.onError = onError;
		let attempts = 0;
		fixture.io.update = async (key, updater) => {
			attempts++;
			if (attempts === 1) throw new Error('quota');
			await update(key, updater);
		};
		const store = createStore(
			'retry-unchanged',
			() => ({ value: 'initial' }),
			{
				namespace: 'retry-unchanged',
				properties: { value: { where: 'device' } },
			},
			fixture.io,
		);
		await store.$persistReady;

		store.value = 'changed';
		await expect(store.$persistFlush()).rejects.toThrow('quota');
		expect(attempts).toBe(1);
		expect(onError).toHaveBeenCalledOnce();
		await store.$persistFlush();

		expect(fixture.storage.get('pinia::retry-unchanged::device')).toEqual({ value: 'changed' });
		expect(attempts).toBe(2);
		await store.$persistDispose();
	});

	test('waits for every failed batch branch before persisting a newer account value', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		const oldStarted = Promise.withResolvers<void>();
		const releaseOld = Promise.withResolvers<void>();
		const registry = new Map<string, unknown>();
		const calls: string[] = [];
		fixture.io.saveAccount = async (_namespace, key, value) => {
			calls.push(`${key}:${value}`);
			if (key === 'first' && value === 'old-a') throw new Error('registry offline');
			if (key === 'second' && value === 'old-b') {
				oldStarted.resolve();
				await releaseOld.promise;
			}
			registry.set(key, value);
		};
		const store = createStore(
			'batch-settlement',
			() => ({ first: '', second: '' }),
			{
				namespace: 'batch-settlement',
				properties: { first: { where: 'account' }, second: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;
		store.$patch({ first: 'old-a', second: 'old-b' });
		const failed = store.$persistFlush();
		let failureSettled = false;
		const failure = failed.then(
			() => {
				throw new Error('Failed batch unexpectedly saved');
			},
			() => {
				failureSettled = true;
			},
		);
		await oldStarted.promise;

		store.second = 'new-b';
		expect(failureSettled).toBe(false);
		expect(calls).toEqual(['first:old-a', 'second:old-b']);
		releaseOld.resolve();
		await failure;
		replacePersistedStateProperty(store, 'first', 'new-a');
		await store.$persistFlush();

		expect(registry.get('second')).toBe('new-b');
		expect(registry.get('first')).toBe('new-a');
		expect(calls.indexOf('second:new-b')).toBeGreaterThan(calls.indexOf('second:old-b'));
		await store.$persistDispose();
	});

	test('cancels an extracted local write when a newer peer commit is accepted', async () => {
		const hub = new ChannelHub();
		const storage = new Map<string, unknown>();
		const firstFixture = createTestIo({ sourceId: 'tab-a', hub, storage });
		const secondFixture = createTestIo({ sourceId: 'tab-b', hub, storage });
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const update = firstFixture.io.update;
		firstFixture.io.update = async (key, updater) => {
			started.resolve();
			await release.promise;
			await update(key, updater);
		};
		const persist = { namespace: 'peer-ownership', properties: { value: { where: 'device' } } } as const;
		const first = createStore('peer-ownership-first', () => ({ value: 'initial' }), persist, firstFixture.io);
		const second = createStore('peer-ownership-second', () => ({ value: 'initial' }), persist, secondFixture.io);
		await Promise.all([first.$persistReady, second.$persistReady]);
		first.value = 'old-local';
		const firstFlush = first.$persistFlush();
		await started.promise;
		second.value = 'new-peer';
		await second.$persistFlush();
		expect(first.value).toBe('new-peer');
		release.resolve();
		await firstFlush;

		expect(storage.get('pinia::peer-ownership::device')).toEqual({ value: 'new-peer' });
		expect(first.value).toBe('new-peer');
		expect(second.value).toBe('new-peer');
		await Promise.all([first.$persistDispose(), second.$persistDispose()]);
	});

	test('drains already-started work and forbids queued writes after disposal', async () => {
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a' });
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const registry = new Map<string, unknown>();
		fixture.io.saveAccount = async (_namespace, key, value) => {
			started.resolve();
			await release.promise;
			registry.set(key, value);
		};
		const store = createStore(
			'terminal-drain',
			() => ({ value: 'initial' }),
			{
				namespace: 'terminal-drain',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistLoaded;
		store.value = 'started';
		const flush = store.$persistFlush();
		await started.promise;
		store.value = 'queued';
		const disposed = store.$persistDispose();
		let drained = false;
		const drain = disposed.then(() => {
			drained = true;
		});
		store.value = 'after-disposal';
		expect(drained).toBe(false);
		release.resolve();
		await Promise.all([flush, drain]);
		fixture.storage.clear();
		registry.clear();
		await store.$persistFlush();

		expect(registry.size).toBe(0);
		expect(fixture.storage.size).toBe(0);
	});

	test('disposal prevents late hydration from patching or recreating cleared storage', async () => {
		const values = Promise.withResolvers<Record<string, unknown>>();
		const fixture = createTestIo({ sourceId: 'tab-a', accountId: 'account-a', accountValues: values.promise });
		const store = createStore(
			'terminal-hydration',
			() => ({ value: 'initial' }),
			{
				namespace: 'terminal-hydration',
				properties: { value: { where: 'account' } },
			},
			fixture.io,
		);
		await store.$persistReady;
		const disposed = store.$persistDispose();
		values.resolve({ value: 'late' });
		await disposed;
		fixture.storage.clear();

		expect(store.value).toBe('initial');
		expect(fixture.setCalls).toEqual([]);
		await store.$persistFlush();
		expect(fixture.storage.size).toBe(0);
	});
});
