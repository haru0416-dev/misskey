/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { markRaw, watch } from 'vue';
import type { PiniaPlugin, StateTree, StoreGeneric } from 'pinia';
import type { Cloneable } from '@/utility/clone.js';
import { deepClone } from '@/utility/clone.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepMerge } from '@/utility/merge.js';

type PersistedStateLocation = 'account' | 'device' | 'deviceAccount';

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
	isCurrent?: () => boolean;
	get: (key: string) => Promise<unknown>;
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
	$persistDispose: () => Promise<void>;
};

declare module 'pinia' {
	export interface DefineStoreOptionsBase<S extends StateTree, Store> {
		persist?: PersistedStateDefinition<S>;
	}

	export interface PiniaCustomProperties<Id extends string, S extends StateTree, G, A> {
		$persistReady: Promise<void>;
		$persistLoaded: Promise<void>;
		$persistFlush(): Promise<void>;
		$persistDispose(): Promise<void>;
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

type PersistedWrite = {
	value: unknown;
	stamp: PersistedStamp;
};

const controllers = new WeakMap<StoreGeneric, PersistedStateController>();

function cloneValue<T>(value: T): T {
	return deepClone(value as Cloneable) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type PersistedStateChannelMessageCandidate = Record<string, unknown> & {
	version?: unknown;
	sourceId?: unknown;
	where?: unknown;
	key?: unknown;
	stamp?: unknown;
};

type PersistedStampCandidate = Record<string, unknown> & {
	time?: unknown;
	sourceId?: unknown;
};

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
	if (a.time !== b.time) {
		return a.time - b.time;
	}
	return a.sourceId.localeCompare(b.sourceId);
}

function isChannelMessage(value: unknown): value is PersistedStateChannelMessage {
	if (!isRecord(value)) {
		return false;
	}
	const message = value as PersistedStateChannelMessageCandidate;
	if (message.version !== 1) {
		return false;
	}
	if (typeof message.sourceId !== 'string') {
		return false;
	}
	if (message.where !== 'device' && message.where !== 'deviceAccount') {
		return false;
	}
	if (typeof message.key !== 'string') {
		return false;
	}
	if (!isRecord(message.stamp)) {
		return false;
	}
	const stamp = message.stamp as PersistedStampCandidate;
	return typeof stamp.time === 'number' && typeof stamp.sourceId === 'string';
}

class PersistedStateController {
	private readonly defaults = new Map<string, unknown>();
	private readonly snapshots = new Map<string, unknown>();
	private readonly lastStamps = new Map<string, PersistedStamp>();
	private readonly dirtyAccountKeys = new Set<string>();
	private readonly channel: PersistedStateChannel | null;
	private readonly channelListener: (event: MessageEvent<unknown>) => void;
	private pendingWrites = new Map<string, PersistedWrite>();
	private readonly failedWrites = new Map<string, PersistedWrite>();
	private readonly latestWrites = new Map<string, PersistedWrite>();
	private scheduledFlush: Promise<void> | null = null;
	private currentJob: Promise<void> = Promise.resolve();
	private stopSubscription: (() => void) | null = null;
	private applyingExternalState = false;
	private lastLocalStampTime = 0;
	private disposed = false;
	private disposal: Promise<void> | null = null;
	private readonly accountId: string | null;

	public readonly ready: Promise<void>;
	public readonly loaded: Promise<void>;

	constructor(
		private readonly store: StoreGeneric,
		private readonly definition: PersistedStateDefinition<StateTree>,
		private readonly io: PersistedStateIo,
	) {
		this.accountId = io.currentAccountId();
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
		const accountId = this.accountId;
		return accountId == null ? '' : `pinia::${this.definition.namespace}::device-account::${accountId}`;
	}

	private get registryCacheKeyName(): string {
		const accountId = this.accountId;
		return accountId == null ? '' : `pinia::${this.definition.namespace}::account-cache::${accountId}`;
	}

	private async initialize(): Promise<void> {
		const accountId = this.accountId;
		const [deviceStateRaw, deviceAccountStateRaw, registryCacheRaw] = await Promise.allSettled([
			this.io.get(this.deviceStateKeyName),
			accountId == null ? Promise.resolve({}) : this.io.get(this.deviceAccountStateKeyName),
			accountId == null ? Promise.resolve({}) : this.io.get(this.registryCacheKeyName),
		]);
		if (deviceStateRaw.status === 'rejected') throw deviceStateRaw.reason;
		if (deviceAccountStateRaw.status === 'rejected') throw deviceAccountStateRaw.reason;
		if (registryCacheRaw.status === 'rejected') throw registryCacheRaw.reason;
		if (this.disposed) return;
		this.assertCurrentOwner();
		const deviceState = toRecord(deviceStateRaw.value);
		const deviceAccountState = toRecord(deviceAccountStateRaw.value);
		const registryCache = toRecord(registryCacheRaw.value);
		const patch: StateTree = {};

		for (const [key, property] of Object.entries(this.definition.properties)) {
			if (property == null) {
				continue;
			}
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
		// 同期監視で外部適用の抑止を共有し、深い変更も対象のプロパティだけ比較する。
		const stops: (() => void)[] = [];
		for (const [key, property] of Object.entries(this.definition.properties)) {
			if (property == null) continue;
			stops.push(
				watch(
					() => this.store.$state[key],
					() => {
						if (!this.applyingExternalState && !this.disposed) this.captureChange(key);
					},
					{ deep: true, flush: 'sync' },
				),
			);
		}
		this.stopSubscription = () => {
			for (const stop of stops) stop();
		};
	}

	private async loadAccountState(): Promise<void> {
		if (this.disposed || this.accountId == null) {
			return;
		}
		this.assertCurrentOwner();
		const values = await this.io.loadAccount(this.definition.namespace);
		if (this.disposed) return;
		this.assertCurrentOwner();
		const patch: StateTree = {};

		for (const [key, property] of Object.entries(this.definition.properties)) {
			if (property == null) {
				continue;
			}
			if (property.where !== 'account') {
				continue;
			}
			if (this.dirtyAccountKeys.has(key)) {
				continue;
			}
			if (Object.hasOwn(values, key)) {
				patch[key] = mergePersistedValue(values[key], this.defaults.get(key));
			} else {
				patch[key] = cloneValue(this.defaults.get(key));
			}
		}

		this.applyPatch(patch);
		await this.queueJob(async () => {
			if (this.disposed) return;
			this.assertCurrentOwner();
			await this.io.update(this.registryCacheKeyName, (current) => {
				if (this.disposed) return current;
				this.assertCurrentOwner();
				const result = toRecord(current);
				for (const [key, value] of Object.entries(patch)) {
					if (this.dirtyAccountKeys.has(key)) continue;
					if (Object.hasOwn(values, key)) {
						result[key] = cloneValue(value);
					} else {
						delete result[key];
					}
				}
				return result;
			});
		});
	}

	private captureChange(key: string): void {
		const property = this.definition.properties[key];
		if (property == null) return;
		const value = this.store.$state[key];
		if (isSameValue(value, this.snapshots.get(key))) return;
		const cloned = cloneValue(value);
		this.snapshots.set(key, cloned);
		const write = { value: cloned, stamp: this.nextLocalStamp(key) };
		this.lastStamps.set(key, write.stamp);
		this.latestWrites.set(key, write);
		this.failedWrites.delete(key);
		this.pendingWrites.set(key, write);
		if (property.where === 'account') this.dirtyAccountKeys.add(key);
		this.scheduleFlush();
	}

	// 未保存値はキーごとに一つだけ保持する。失敗値は明示的な flush まで再試行しない。
	private scheduleFlush(): Promise<void> {
		if (this.scheduledFlush != null) {
			return this.scheduledFlush;
		}
		if (this.disposed) return Promise.resolve();

		this.scheduledFlush = Promise.resolve().then(async () => {
			const job = this.queueJob(async () => {
				if (this.disposed) return;
				const writes = this.pendingWrites;
				this.pendingWrites = new Map();
				await this.persistBatch(writes);
			});
			try {
				await job;
			} finally {
				this.scheduledFlush = null;
				if (!this.disposed && this.pendingWrites.size > 0) {
					this.scheduleFlush();
				}
			}
		});
		void this.scheduledFlush.catch((error) => this.io.onError?.(error));
		return this.scheduledFlush;
	}

	private queueJob(task: () => Promise<void>): Promise<void> {
		const job = this.currentJob.then(task);
		// 待機用の tail は失敗後も進める。呼び出し側には失敗する job 自体を返す。
		this.currentJob = job.then(
			() => undefined,
			() => undefined,
		);
		return job;
	}

	private assertCurrentOwner(): void {
		if (this.io.isCurrent?.() === false) {
			throw new Error('Persisted state account is no longer selected');
		}
	}

	private ownsWrite(key: string, write: PersistedWrite): boolean {
		return !this.disposed && this.latestWrites.get(key) === write;
	}

	private async settleWrites(writes: Map<string, PersistedWrite>, task: () => Promise<void>): Promise<void> {
		try {
			await task();
			for (const [key, write] of writes) {
				if (this.latestWrites.get(key) === write) {
					this.latestWrites.delete(key);
					this.failedWrites.delete(key);
				}
			}
		} catch (error) {
			for (const [key, write] of writes) {
				if (this.ownsWrite(key, write)) this.failedWrites.set(key, write);
			}
			throw error;
		}
	}

	private async persistBatch(writes: Map<string, PersistedWrite>): Promise<void> {
		if (writes.size === 0 || this.disposed) {
			return;
		}
		this.assertCurrentOwner();
		const deviceWrites = new Map<string, PersistedWrite>();
		const deviceAccountWrites = new Map<string, PersistedWrite>();
		const accountWrites = new Map<string, PersistedWrite>();

		for (const [key, value] of writes) {
			const property = this.definition.properties[key];
			if (property?.where === 'device') {
				deviceWrites.set(key, value);
			}
			if (property?.where === 'deviceAccount') {
				deviceAccountWrites.set(key, value);
			}
			if (property?.where === 'account') {
				accountWrites.set(key, value);
			}
		}

		const results = await Promise.allSettled([
			this.settleWrites(deviceWrites, () => this.persistLocalBatch('device', this.deviceStateKeyName, deviceWrites)),
			this.settleWrites(deviceAccountWrites, () =>
				this.accountId == null
					? Promise.resolve()
					: this.persistLocalBatch('deviceAccount', this.deviceAccountStateKeyName, deviceAccountWrites),
			),
			this.persistAccountBatch(accountWrites),
		]);
		this.throwFailures(results);
	}

	private async persistLocalBatch(
		where: 'device' | 'deviceAccount',
		storageKey: string,
		writes: Map<string, PersistedWrite>,
	): Promise<void> {
		if (writes.size === 0 || this.disposed) {
			return;
		}
		const committed = new Map<string, PersistedWrite>();
		await this.io.update(storageKey, (current) => {
			if (this.disposed) return current;
			this.assertCurrentOwner();
			const state = toRecord(current);
			for (const [key, write] of writes) {
				if (!this.ownsWrite(key, write)) continue;
				state[key] = cloneValue(write.value);
				committed.set(key, write);
			}
			return state;
		});
		if (this.disposed) return;
		this.assertCurrentOwner();

		for (const [key, write] of committed) {
			if (!this.ownsWrite(key, write)) continue;
			const accountId = this.accountId;
			this.channel?.postMessage({
				version: 1,
				sourceId: this.io.sourceId,
				where,
				key,
				value: write.value,
				...(where === 'deviceAccount' && accountId != null ? { accountId } : {}),
				stamp: write.stamp,
			});
		}
	}

	private async persistAccountBatch(writes: Map<string, PersistedWrite>): Promise<void> {
		if (writes.size === 0 || this.accountId == null || this.disposed) {
			return;
		}
		try {
			await this.io.update(this.registryCacheKeyName, (current) => {
				if (this.disposed) return current;
				this.assertCurrentOwner();
				const cache = toRecord(current);
				for (const [key, write] of writes) {
					if (this.ownsWrite(key, write)) cache[key] = cloneValue(write.value);
				}
				return cache;
			});
		} catch (error) {
			for (const [key, write] of writes) {
				if (this.ownsWrite(key, write)) this.failedWrites.set(key, write);
			}
			throw error;
		}
		const results = await Promise.allSettled(
			Array.from(writes, async ([key, write]) => {
				try {
					if (this.ownsWrite(key, write)) {
						this.assertCurrentOwner();
						await this.io.saveAccount(this.definition.namespace, key, write.value);
					}
					if (this.latestWrites.get(key) === write) {
						this.latestWrites.delete(key);
						this.failedWrites.delete(key);
					}
				} catch (error) {
					if (this.ownsWrite(key, write)) this.failedWrites.set(key, write);
					throw error;
				}
			}),
		);
		this.throwFailures(results);
	}

	private throwFailures(results: PromiseSettledResult<void>[]): void {
		const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, 'Failed to persist state');
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
		if (this.disposed || this.io.isCurrent?.() === false || !isChannelMessage(data)) {
			return;
		}
		if (data.sourceId === this.io.sourceId) {
			return;
		}
		const property = this.definition.properties[data.key];
		if (property?.where !== data.where) {
			return;
		}
		if (data.where === 'deviceAccount' && data.accountId !== this.accountId) {
			return;
		}
		const lastStamp = this.lastStamps.get(data.key);
		if (lastStamp != null && compareStamp(data.stamp, lastStamp) <= 0) {
			return;
		}

		this.lastStamps.set(data.key, data.stamp);
		this.latestWrites.delete(data.key);
		this.pendingWrites.delete(data.key);
		this.failedWrites.delete(data.key);
		this.applyPatch({ [data.key]: data.value });
	}

	private applyPatch(patch: StateTree): void {
		if (Object.keys(patch).length === 0) {
			return;
		}
		this.applyingExternalState = true;
		try {
			this.store.$patch((state) => {
				for (const [key, value] of Object.entries(patch)) state[key] = cloneValue(value);
			});
			for (const key of Object.keys(patch)) {
				this.snapshots.set(key, cloneValue(this.store.$state[key]));
			}
		} finally {
			this.applyingExternalState = false;
		}
	}

	public replaceProperty(key: string, value: unknown): void {
		if (this.disposed) throw new Error('Persisted state is disposed');
		this.assertCurrentOwner();
		this.applyingExternalState = true;
		try {
			this.store.$patch((state) => {
				state[key] = cloneValue(value);
			});
		} finally {
			this.applyingExternalState = false;
		}
		if (this.stopSubscription != null) this.captureChange(key);
	}

	public async flush(): Promise<void> {
		if (this.disposed) {
			await this.disposal;
			return;
		}
		this.assertCurrentOwner();
		await this.ready;
		if (this.disposed) {
			await this.disposal;
			return;
		}
		this.assertCurrentOwner();
		for (const [key, write] of this.failedWrites) {
			if (this.ownsWrite(key, write)) this.pendingWrites.set(key, write);
		}
		this.failedWrites.clear();
		while (this.scheduledFlush != null || this.pendingWrites.size > 0) {
			await (this.scheduledFlush ?? this.scheduleFlush());
		}
		await this.currentJob;
	}

	// 終了は保存の成功ではなく副作用の停止境界。既に開始した I/O が全て終わるまで clear してはいけない。
	public dispose(): Promise<void> {
		if (this.disposal != null) return this.disposal;
		this.disposed = true;
		this.stopSubscription?.();
		this.stopSubscription = null;
		this.pendingWrites.clear();
		this.failedWrites.clear();
		this.latestWrites.clear();
		this.channel?.removeEventListener('message', this.channelListener);
		this.channel?.close();
		this.disposal = Promise.allSettled([this.ready, this.loaded, this.scheduledFlush, this.currentJob]).then(
			() => undefined,
		);
		return this.disposal;
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

export function replacePersistedStateProperty(store: StoreGeneric, key: string, value: unknown): void {
	const controller = controllers.get(store);
	if (controller != null) {
		controller.replaceProperty(key, value);
	} else {
		store.$patch((state) => {
			state[key] = cloneValue(value);
		});
	}
}

const noPersistenceApi: PersistedStateApi = {
	$persistReady: Promise.resolve(),
	$persistLoaded: Promise.resolve(),
	$persistFlush: () => Promise.resolve(),
	$persistDispose: () => Promise.resolve(),
};

// プラグインが足す Promise はリアクティブにする意味がない。markRaw で明示しないと Pinia 4 が storeToRefs() の対象外だと警告する。
function markPersistApiRaw(api: PersistedStateApi): PersistedStateApi {
	return { ...api, $persistReady: markRaw(api.$persistReady), $persistLoaded: markRaw(api.$persistLoaded) };
}

export function createPersistedStatePlugin(io: PersistedStateIo): PiniaPlugin {
	return ({ store, options }) => {
		if (options.persist == null) {
			return markPersistApiRaw(noPersistenceApi);
		}
		return markPersistApiRaw(attachPersistedState(store, options.persist, io));
	};
}
