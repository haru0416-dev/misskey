/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MutationType } from 'pinia';
import type { PiniaPlugin, StateTree, StoreGeneric } from 'pinia';
import type { Cloneable } from '@/utility/clone.js';
import { deepClone } from '@/utility/clone.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepMerge } from '@/utility/merge.js';

export type PersistedStateLocation = 'account' | 'device' | 'deviceAccount';

export type PersistedStateDefinition<S extends StateTree> = {
	namespace: string;
	properties: {
		[K in Extract<keyof S, string>]?: {
			where: PersistedStateLocation;
		};
	};
};

export type PersistedStateChannel = {
	postMessage: (message: PersistedStateChannelMessage) => void;
	addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
	removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
	close: () => void;
};

export type PersistedStateIo = {
	sourceId: string;
	currentAccountId: () => string | null;
	get: (key: string) => Promise<unknown>;
	set: (key: string, value: unknown) => Promise<void>;
	update: (key: string, updater: (value: unknown) => unknown) => Promise<void>;
	loadAccount: (namespace: string) => Promise<Record<string, unknown>>;
	saveAccount: (namespace: string, key: string, value: unknown) => Promise<void>;
	createChannel: (name: string) => PersistedStateChannel | null;
	onError?: (error: unknown) => void;
};

export type PersistedStateApi = {
	$persistReady: Promise<void>;
	$persistLoaded: Promise<void>;
	$persistFlush: () => Promise<void>;
	$persistDispose: () => void;
};

declare module 'pinia' {
	export interface DefineStoreOptionsBase<S extends StateTree, Store> {
		persist?: PersistedStateDefinition<S>;
	}

	export interface PiniaCustomProperties<Id extends string, S extends StateTree, G, A> {
		$persistReady: Promise<void>;
		$persistLoaded: Promise<void>;
		$persistFlush(): Promise<void>;
		$persistDispose(): void;
	}
}

type PersistedStateChannelMessage = {
	version: 1;
	sourceId: string;
	where: 'device' | 'deviceAccount';
	key: string;
	value: unknown;
	accountId?: string;
	stamp: {
		time: number;
		sourceId: string;
	};
};

type PersistedStamp = PersistedStateChannelMessage['stamp'];

const controllers = new WeakMap<StoreGeneric, PersistedStateController>();

function cloneValue<T>(value: T): T {
	return deepClone(value as Cloneable) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function mergePersistedValue(value: unknown, defaultValue: unknown): unknown {
	if (isRecord(value) && isRecord(defaultValue)) {
		return deepMerge(value, defaultValue);
	}
	return cloneValue(value);
}

function isSameValue(a: unknown, b: unknown): boolean {
	return deepEqual(a as Parameters<typeof deepEqual>[0], b as Parameters<typeof deepEqual>[1]);
}

function compareStamp(a: PersistedStamp, b: PersistedStamp): number {
	if (a.time !== b.time) return a.time - b.time;
	return a.sourceId.localeCompare(b.sourceId);
}

function isChannelMessage(value: unknown): value is PersistedStateChannelMessage {
	if (!isRecord(value)) return false;
	if (value.version !== 1) return false;
	if (typeof value.sourceId !== 'string') return false;
	if (value.where !== 'device' && value.where !== 'deviceAccount') return false;
	if (typeof value.key !== 'string') return false;
	if (!isRecord(value.stamp)) return false;
	return typeof value.stamp.time === 'number' && typeof value.stamp.sourceId === 'string';
}

class PersistedStateController {
	private readonly defaults = new Map<string, unknown>();
	private readonly snapshots = new Map<string, unknown>();
	private readonly lastStamps = new Map<string, PersistedStamp>();
	private readonly dirtyAccountKeys = new Set<string>();
	private readonly channel: PersistedStateChannel | null;
	private readonly channelListener: (event: MessageEvent<unknown>) => void;
	private pendingWrites = new Map<string, unknown>();
	private scheduledFlush: Promise<void> | null = null;
	private currentJob: Promise<void> = Promise.resolve();
	private stopSubscription: (() => void) | null = null;
	private applyingExternalState = false;
	private lastLocalStampTime = 0;
	private disposed = false;

	public readonly ready: Promise<void>;
	public readonly loaded: Promise<void>;

	constructor(
		private readonly store: StoreGeneric,
		private readonly definition: PersistedStateDefinition<StateTree>,
		private readonly io: PersistedStateIo,
	) {
		for (const key of Object.keys(this.definition.properties)) {
			this.defaults.set(key, cloneValue(this.store.$state[key]));
			this.snapshots.set(key, cloneValue(this.store.$state[key]));
		}

		this.channel = this.io.createChannel(`pinia-persist::${this.definition.namespace}`);
		this.channelListener = (event) => this.receiveChannelMessage(event.data);

		this.ready = this.initialize();
		this.loaded = this.ready
			.then(() => this.loadAccountState())
			.catch((error) => {
				this.io.onError?.(error);
			});
	}

	private get deviceStateKeyName(): string {
		return `pinia::${this.definition.namespace}::device`;
	}

	private get deviceAccountStateKeyName(): string {
		const accountId = this.io.currentAccountId();
		return accountId == null ? '' : `pinia::${this.definition.namespace}::device-account::${accountId}`;
	}

	private get registryCacheKeyName(): string {
		const accountId = this.io.currentAccountId();
		return accountId == null ? '' : `pinia::${this.definition.namespace}::account-cache::${accountId}`;
	}

	private async initialize(): Promise<void> {
		const accountId = this.io.currentAccountId();
		const [deviceStateRaw, deviceAccountStateRaw, registryCacheRaw] = await Promise.all([
			this.io.get(this.deviceStateKeyName),
			accountId == null ? Promise.resolve({}) : this.io.get(this.deviceAccountStateKeyName),
			accountId == null ? Promise.resolve({}) : this.io.get(this.registryCacheKeyName),
		]);
		const deviceState = toRecord(deviceStateRaw);
		const deviceAccountState = toRecord(deviceAccountStateRaw);
		const registryCache = toRecord(registryCacheRaw);
		const patch: StateTree = {};

		for (const [key, property] of Object.entries(this.definition.properties)) {
			if (property == null) continue;
			const source =
				property.where === 'device'
					? deviceState
					: property.where === 'deviceAccount'
						? deviceAccountState
						: registryCache;
			if (Object.hasOwn(source, key)) {
				patch[key] = mergePersistedValue(source[key], this.defaults.get(key));
			}
		}

		this.applyPatch(patch);
		this.channel?.addEventListener('message', this.channelListener);
		this.stopSubscription = this.store.$subscribe(
			(mutation) => {
				if (this.applyingExternalState || this.disposed) return;
				this.captureChanges(mutation.type === MutationType.patchObject ? Object.keys(mutation.payload) : undefined);
			},
			{ detached: true, flush: 'sync' },
		);
	}

	private async loadAccountState(): Promise<void> {
		if (this.io.currentAccountId() == null) return;
		const values = await this.io.loadAccount(this.definition.namespace);
		const patch: StateTree = {};
		const cache: Record<string, unknown> = {};

		for (const [key, property] of Object.entries(this.definition.properties)) {
			if (property == null) continue;
			if (property.where !== 'account') continue;
			if (this.dirtyAccountKeys.has(key)) {
				cache[key] = cloneValue(this.store.$state[key]);
				continue;
			}
			if (Object.hasOwn(values, key)) {
				patch[key] = mergePersistedValue(values[key], this.defaults.get(key));
				cache[key] = cloneValue(values[key]);
			} else {
				patch[key] = cloneValue(this.defaults.get(key));
			}
		}

		this.applyPatch(patch);
		await this.io.set(this.registryCacheKeyName, cache);
	}

	private captureChanges(candidateKeys?: readonly string[]): void {
		const keys = candidateKeys ?? Object.keys(this.definition.properties);
		for (const key of keys) {
			const property = this.definition.properties[key];
			if (property == null) continue;
			const value = this.store.$state[key];
			if (isSameValue(value, this.snapshots.get(key))) continue;
			const cloned = cloneValue(value);
			this.snapshots.set(key, cloned);
			this.pendingWrites.set(key, cloned);
			if (property.where === 'account') this.dirtyAccountKeys.add(key);
		}
		if (this.pendingWrites.size > 0) this.scheduleFlush();
	}

	private scheduleFlush(): Promise<void> {
		if (this.scheduledFlush != null) return this.scheduledFlush;

		this.scheduledFlush = Promise.resolve().then(async () => {
			const writes = this.pendingWrites;
			this.pendingWrites = new Map();
			const job = this.currentJob.catch(() => undefined).then(() => this.persistBatch(writes));
			this.currentJob = job;
			try {
				await job;
			} finally {
				this.scheduledFlush = null;
				if (this.pendingWrites.size > 0) this.scheduleFlush();
			}
		});

		return this.scheduledFlush;
	}

	private async persistBatch(writes: Map<string, unknown>): Promise<void> {
		if (writes.size === 0) return;
		const deviceWrites = new Map<string, unknown>();
		const deviceAccountWrites = new Map<string, unknown>();
		const accountWrites = new Map<string, unknown>();

		for (const [key, value] of writes) {
			const property = this.definition.properties[key];
			if (property?.where === 'device') deviceWrites.set(key, value);
			if (property?.where === 'deviceAccount') deviceAccountWrites.set(key, value);
			if (property?.where === 'account') accountWrites.set(key, value);
		}

		await Promise.all([
			this.persistLocalBatch('device', this.deviceStateKeyName, deviceWrites),
			this.io.currentAccountId() == null
				? Promise.resolve()
				: this.persistLocalBatch('deviceAccount', this.deviceAccountStateKeyName, deviceAccountWrites),
			this.persistAccountBatch(accountWrites),
		]);
	}

	private async persistLocalBatch(
		where: 'device' | 'deviceAccount',
		storageKey: string,
		writes: Map<string, unknown>,
	): Promise<void> {
		if (writes.size === 0) return;
		await this.io.update(storageKey, (current) => {
			const state = toRecord(current);
			for (const [key, value] of writes) state[key] = cloneValue(value);
			return state;
		});

		for (const [key, value] of writes) {
			const stamp = this.nextLocalStamp(key);
			const accountId = this.io.currentAccountId();
			this.lastStamps.set(key, stamp);
			this.channel?.postMessage({
				version: 1,
				sourceId: this.io.sourceId,
				where,
				key,
				value,
				...(where === 'deviceAccount' && accountId != null ? { accountId } : {}),
				stamp,
			});
		}
	}

	private async persistAccountBatch(writes: Map<string, unknown>): Promise<void> {
		if (writes.size === 0 || this.io.currentAccountId() == null) return;
		await this.io.update(this.registryCacheKeyName, (current) => {
			const cache = toRecord(current);
			for (const [key, value] of writes) cache[key] = cloneValue(value);
			return cache;
		});
		await Promise.all(Array.from(writes, ([key, value]) => this.io.saveAccount(this.definition.namespace, key, value)));
	}

	private nextLocalStamp(key: string): PersistedStamp {
		this.lastLocalStampTime = Math.max(
			Date.now(),
			this.lastLocalStampTime + 1,
			(this.lastStamps.get(key)?.time ?? 0) + 1,
		);
		return {
			time: this.lastLocalStampTime,
			sourceId: this.io.sourceId,
		};
	}

	private receiveChannelMessage(data: unknown): void {
		if (!isChannelMessage(data)) return;
		if (data.sourceId === this.io.sourceId) return;
		const property = this.definition.properties[data.key];
		if (property?.where !== data.where) return;
		if (data.where === 'deviceAccount' && data.accountId !== this.io.currentAccountId()) return;
		const lastStamp = this.lastStamps.get(data.key);
		if (lastStamp != null && compareStamp(data.stamp, lastStamp) <= 0) return;

		this.lastStamps.set(data.key, data.stamp);
		this.applyPatch({ [data.key]: cloneValue(data.value) });
	}

	private applyPatch(patch: StateTree): void {
		if (Object.keys(patch).length === 0) return;
		this.applyingExternalState = true;
		try {
			this.store.$patch(patch);
			for (const [key, value] of Object.entries(patch)) {
				this.snapshots.set(key, cloneValue(value));
			}
		} finally {
			this.applyingExternalState = false;
		}
	}

	public async flush(): Promise<void> {
		while (this.scheduledFlush != null || this.pendingWrites.size > 0) {
			await (this.scheduledFlush ?? this.scheduleFlush());
		}
		await this.currentJob;
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stopSubscription?.();
		this.stopSubscription = null;
		this.channel?.removeEventListener('message', this.channelListener);
		this.channel?.close();
	}
}

export function attachPersistedState(
	store: StoreGeneric,
	definition: PersistedStateDefinition<StateTree>,
	io: PersistedStateIo,
): PersistedStateApi {
	const existing = controllers.get(store);
	if (existing != null) {
		return {
			$persistReady: existing.ready,
			$persistLoaded: existing.loaded,
			$persistFlush: () => existing.flush(),
			$persistDispose: () => existing.dispose(),
		};
	}

	const controller = new PersistedStateController(store, definition, io);
	controllers.set(store, controller);
	return {
		$persistReady: controller.ready,
		$persistLoaded: controller.loaded,
		$persistFlush: () => controller.flush(),
		$persistDispose: () => controller.dispose(),
	};
}

const noPersistenceApi: PersistedStateApi = {
	$persistReady: Promise.resolve(),
	$persistLoaded: Promise.resolve(),
	$persistFlush: () => Promise.resolve(),
	$persistDispose: () => undefined,
};

export function createPersistedStatePlugin(io: PersistedStateIo): PiniaPlugin {
	return ({ store, options }) => {
		if (options.persist == null) return noPersistenceApi;
		return attachPersistedState(store, options.persist, io);
	};
}
