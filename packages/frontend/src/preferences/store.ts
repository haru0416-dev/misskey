/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, watch } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { defineStore } from 'pinia';
import { host, version } from '@/shared/utility/config.js';
import { PREF_DEF } from './def.js';
import type { Ref } from 'vue';
import type { Pinia } from 'pinia';
import type { MenuItem } from '@/types/menu.js';
import { genId } from '@/utility/id.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepClone } from '@/utility/clone.js';
import type { Cloneable } from '@/utility/clone.js';

// null は有効な設定値でもあるため、設定の存在判定に null 比較や ?? を使わない。

export type PREF = typeof PREF_DEF;
type DefaultValues = {
	[K in keyof PREF]: PREF[K]['default'] extends () => infer R ? R : PREF[K]['default'];
};
export type ValueOf<K extends keyof PREF> = DefaultValues[K];

export type Scope = Partial<{
	server: string | null;
	account: string | null;
	device: string | null;
}>;

type ValueMeta = Partial<{
	sync: boolean;
}>;

type PrefRecord<K extends keyof PREF> = [scope: Scope, value: ValueOf<K>, meta: ValueMeta];

function parseScope(scope: Scope): {
	server: string | null;
	account: string | null;
	device: string | null;
} {
	return {
		server: scope.server ?? null,
		account: scope.account ?? null,
		device: scope.device ?? null,
	};
}

function makeScope(
	scope: Partial<{
		server: string | null;
		account: string | null;
		device: string | null;
	}>,
): Scope {
	const c = {} as Scope;
	if (scope.server != null) {
		c.server = scope.server;
	}
	if (scope.account != null) {
		c.account = scope.account;
	}
	if (scope.device != null) {
		c.device = scope.device;
	}
	return c;
}

export function isSameScope(a: Scope, b: Scope): boolean {
	// null と undefined (キー無し) は区別したくないので == で比較
	return a.server == b.server && a.account == b.account && a.device == b.device;
}

export type PreferencesProfile = {
	id: string;
	version: string;
	type: 'main';
	modifiedAt: number;
	name: string;
	preferences: {
		[K in keyof PREF]: PrefRecord<K>[];
	};
};

export type PossiblyNonNormalizedPreferencesProfile = Omit<PreferencesProfile, 'preferences'> & {
	preferences: Record<string, [scope: Scope, value: unknown, meta: ValueMeta][]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null | undefined {
	return value === undefined || value === null || typeof value === 'string';
}

type ScopeCandidate = Record<string, unknown> & {
	server?: unknown;
	account?: unknown;
	device?: unknown;
};

type ValueMetaCandidate = Record<string, unknown> & {
	sync?: unknown;
};

type PreferencesProfileCandidate = Record<string, unknown> & {
	id?: unknown;
	version?: unknown;
	type?: unknown;
	modifiedAt?: unknown;
	name?: unknown;
	preferences?: unknown;
};

function isScope(value: unknown): value is Scope {
	if (!isRecord(value)) {
		return false;
	}
	const scope = value as ScopeCandidate;
	return isNullableString(scope.server) && isNullableString(scope.account) && isNullableString(scope.device);
}

function isValueMeta(value: unknown): value is ValueMeta {
	if (!isRecord(value)) {
		return false;
	}
	const meta = value as ValueMetaCandidate;
	return meta.sync === undefined || typeof meta.sync === 'boolean';
}

function isPreferenceRecord(value: unknown): value is [scope: Scope, value: unknown, meta: ValueMeta] {
	return Array.isArray(value) && value.length === 3 && isScope(value[0]) && isValueMeta(value[2]);
}

export function isPossiblyNonNormalizedPreferencesProfile(
	value: unknown,
): value is PossiblyNonNormalizedPreferencesProfile {
	if (!isRecord(value)) {
		return false;
	}
	const profile = value as PreferencesProfileCandidate;
	if (!isRecord(profile.preferences)) {
		return false;
	}

	return (
		typeof profile.id === 'string' &&
		typeof profile.version === 'string' &&
		profile.type === 'main' &&
		typeof profile.modifiedAt === 'number' &&
		Number.isFinite(profile.modifiedAt) &&
		typeof profile.name === 'string' &&
		Object.values(profile.preferences).every((records) => Array.isArray(records) && records.every(isPreferenceRecord))
	);
}

export type StorageProvider = {
	load: () => PossiblyNonNormalizedPreferencesProfile | null;
	save: (ctx: { profile: PreferencesProfile }) => PreferencesProfile | void;
	replace?: (profile: PreferencesProfile) => PreferencesProfile;
	isCurrent?: () => boolean;
	cloudGetBulk: <K extends keyof PREF>(ctx: {
		needs: { key: K; scope: Scope }[];
	}) => Promise<Partial<Record<K, ValueOf<K>>>>;
	cloudGet: <K extends keyof PREF>(ctx: { key: K; scope: Scope }) => Promise<{ value: ValueOf<K> } | null>;
	cloudSet: <K extends keyof PREF>(ctx: { key: K; scope: Scope; value: ValueOf<K> }) => Promise<void>;
};

export type PreferencesDefinitionRecord<Default, T = Default extends () => infer R ? R : Default> = {
	default: Default;
	accountDependent?: boolean;
	serverDependent?: boolean;
	mergeStrategy?: (a: T, b: T) => T;
};

type PreferencesDefinition = Record<string, PreferencesDefinitionRecord<unknown>>;

type PreferencesStoreEvents = {
	committed: <K extends keyof PREF>(ctx: { key: K; value: ValueOf<K>; oldValue: ValueOf<K> }) => void;
	saved: () => void;
};

export const preferencesEvents = new EventEmitter<PreferencesStoreEvents>();

export function getInitialPrefValue<K extends keyof PREF>(k: K): ValueOf<K> {
	const _default = PREF_DEF[k].default;
	if (typeof _default === 'function') {
		return _default() as ValueOf<K>;
	}
	// 設定値の参照共有を避けるため複製する。
	return deepClone(_default as unknown as ValueOf<K>);
}

function isAccountDependentKey<K extends keyof PREF>(key: K): boolean {
	return (PREF_DEF as PreferencesDefinition)[key]?.accountDependent === true;
}

function isServerDependentKey<K extends keyof PREF>(key: K): boolean {
	return (PREF_DEF as PreferencesDefinition)[key]?.serverDependent === true;
}

function createEmptyProfile(): PossiblyNonNormalizedPreferencesProfile {
	return {
		id: genId(),
		version,
		type: 'main',
		modifiedAt: Date.now(),
		name: '',
		preferences: {},
	};
}

function normalizePreferences(
	preferences: PossiblyNonNormalizedPreferencesProfile['preferences'],
	account: { id: string } | null,
): PreferencesProfile['preferences'] {
	const data = {} as Record<string, [scope: Scope, value: unknown, meta: ValueMeta][]>;
	for (const key in PREF_DEF) {
		const records = preferences[key];
		if (records == null || records.length === 0) {
			const v = getInitialPrefValue(key as keyof typeof PREF_DEF);
			if (isAccountDependentKey(key as keyof typeof PREF_DEF)) {
				data[key] = account
					? [
							[makeScope({}), v, {}],
							[
								makeScope({
									server: host,
									account: account.id,
								}),
								v,
								{},
							],
						]
					: [[makeScope({}), v, {}]];
			} else if (isServerDependentKey(key as keyof typeof PREF_DEF)) {
				data[key] = [
					[
						makeScope({
							server: host,
						}),
						v,
						{},
					],
				];
			} else {
				data[key] = [[makeScope({}), v, {}]];
			}
			continue;
		} else {
			if (
				account &&
				isAccountDependentKey(key as keyof typeof PREF_DEF) &&
				!records.some(([scope]) => parseScope(scope).server === host && parseScope(scope).account === account.id)
			) {
				data[key] = records.concat([
					[
						makeScope({
							server: host,
							account: account.id,
						}),
						getInitialPrefValue(key as keyof typeof PREF_DEF),
						{},
					],
				]);
				continue;
			}
			if (
				account &&
				isServerDependentKey(key as keyof typeof PREF_DEF) &&
				!records.some(([scope]) => parseScope(scope).server === host)
			) {
				data[key] = records.concat([
					[
						makeScope({
							server: host,
						}),
						getInitialPrefValue(key as keyof typeof PREF_DEF),
						{},
					],
				]);
				continue;
			}

			data[key] = records;
		}
	}

	return data as PreferencesProfile['preferences'];
}

// 正規化で変更しない配列は共有するため、キー集合と配列の参照だけで保存の必要性を判断できる。
function hasNormalizationChanges(
	source: PossiblyNonNormalizedPreferencesProfile['preferences'],
	normalized: Record<string, unknown>,
): boolean {
	const keys = Object.keys(normalized);
	return keys.length !== Object.keys(source).length || keys.some((key) => source[key] !== normalized[key]);
}

function getMatchedRecordFromProfile<K extends keyof PREF>(
	profile: PreferencesProfile,
	currentAccount: { id: string } | null,
	key: K,
): PrefRecord<K> {
	const records = profile.preferences[key];

	if (currentAccount == null) {
		const record = records.find(([scope]) => parseScope(scope).account == null);
		if (record == null) {
			throw new Error(`no record found for key: ${key}`);
		}
		return record;
	}

	const accountOverrideRecord = records.find(
		([scope]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
	);
	if (accountOverrideRecord) {
		return accountOverrideRecord;
	}

	const serverOverrideRecord = records.find(
		([scope]) => parseScope(scope).server === host && parseScope(scope).account == null,
	);
	if (serverOverrideRecord) {
		return serverOverrideRecord;
	}

	const record = records.find(([scope]) => parseScope(scope).account == null);
	if (record == null) {
		throw new Error(`no record found for key: ${key}`);
	}
	return record;
}

type PreferenceValues = {
	[K in keyof PREF]: ValueOf<K>;
};

type PreferencesStoreState = PreferenceValues & {
	profile: PreferencesProfile;
};

function generatePreferenceValues(
	profile: PreferencesProfile,
	currentAccount: { id: string } | null,
): PreferenceValues {
	const values = {} as PreferenceValues;
	for (const _key in PREF_DEF) {
		const key = _key as keyof PREF;
		(values[key] as unknown) = getMatchedRecordFromProfile(profile, currentAccount, key)[1];
	}
	return values;
}

function createPreferencesStoreState(
	io: StorageProvider,
	currentAccount: { id: string } | null,
	onSaveError: () => void,
): PreferencesStoreState {
	const loadedProfile = io.load() ?? createEmptyProfile();
	let profile: PreferencesProfile = {
		...loadedProfile,
		preferences: normalizePreferences(loadedProfile.preferences, currentAccount),
	};

	if (hasNormalizationChanges(loadedProfile.preferences, profile.preferences)) {
		try {
			const merged = io.save({ profile });
			if (merged != null)
				profile = { ...merged, preferences: normalizePreferences(merged.preferences, currentAccount) };
		} catch (error) {
			onSaveError();
			console.error('Failed to initialize preferences storage', error);
		}
	}

	return {
		...generatePreferenceValues(profile, currentAccount),
		profile,
	};
}

// accountDependent な設定は、初期状態でもアカウントごとのスコープにレコードを作成する。サーバー同期に必要な不変条件。
export function createPreferencesStore(io: StorageProvider, account: { id: string } | null, pinia: Pinia) {
	const currentAccount = account == null ? null : { id: account.id };
	const localRevisions = new Map<keyof PREF, number>();
	const syncOperations = new Map<keyof PREF, symbol>();
	const pendingCloudWrites = new Map<
		string,
		{
			key: keyof PREF;
			scope: Scope;
			value: ValueOf<keyof PREF>;
			isCurrent?: () => boolean;
		}
	>();
	const cloudOperations = new Set<Promise<unknown>>();
	let disposed = false;
	let localSaveFailed = false;
	let cloudJob: Promise<void> | null = null;
	let profileEpoch = 0;

	function trackCloud<T>(operation: Promise<T>): Promise<T> {
		cloudOperations.add(operation);
		void operation.then(
			() => cloudOperations.delete(operation),
			() => cloudOperations.delete(operation),
		);
		return operation;
	}

	async function flushCloudWrites(): Promise<void> {
		if (cloudJob != null) await cloudJob;
		if (disposed || pendingCloudWrites.size === 0) return;
		cloudJob = (async () => {
			while (pendingCloudWrites.size > 0) {
				if (disposed) break;
				const [id, write] = pendingCloudWrites.entries().next().value!;
				pendingCloudWrites.delete(id);
				if (write.isCurrent?.() === false) continue;
				try {
					await trackCloud(io.cloudSet({ key: write.key, scope: write.scope, value: write.value }));
				} catch (error) {
					if (!disposed && write.isCurrent?.() !== false && !pendingCloudWrites.has(id))
						pendingCloudWrites.set(id, write);
					throw error;
				}
			}
		})();
		try {
			await cloudJob;
		} finally {
			cloudJob = null;
		}
	}

	function queueCloudWrite<K extends keyof PREF>(
		key: K,
		record: PrefRecord<K>,
		isCurrent?: () => boolean,
	): Promise<void> {
		const scope = deepClone(record[0]);
		const id = JSON.stringify([key, scope.server ?? null, scope.account ?? null, scope.device ?? null]);
		pendingCloudWrites.set(id, {
			key,
			scope,
			value: deepClone(record[1]),
			...(isCurrent == null ? {} : { isCurrent }),
		});
		const saved = flushCloudWrites();
		void saved.catch((error) => console.error('Failed to save preferences to the cloud', error));
		return saved;
	}
	const usePreferencesStore = defineStore('preferences', {
		state: () =>
			createPreferencesStoreState(io, currentAccount, () => {
				localSaveFailed = true;
			}),
		actions: {
			_rewriteRawState<K extends keyof PREF>(key: K, value: ValueOf<K>) {
				const v = deepClone(value as Cloneable) as ValueOf<K>; // Vue のプロキシと入力値の参照共有を避ける。
				(this.$state[key] as unknown) = v;
			},

			commit<K extends keyof PREF>(key: K, value: ValueOf<K>) {
				if (disposed) throw new Error('Preferences store is disposed');
				if (deepEqual(this.$state[key], value)) {
					if (localSaveFailed) this.save();
					const record = this.getMatchedRecordOf(key);
					if (record[2].sync && pendingCloudWrites.size > 0) {
						queueCloudWrite(key, record);
					}
					return;
				}

				const v = deepClone(value as Cloneable) as ValueOf<K>;
				const previousValue = this.$state[key] as ValueOf<K>;
				const oldValue = deepClone(previousValue);
				const previousRecords = this.profile.preferences[key].map((entry) => [...entry]) as PrefRecord<K>[];
				localRevisions.set(key, (localRevisions.get(key) ?? 0) + 1);
				this._rewriteRawState(key, v);
				const record = this.getMatchedRecordOf(key);

				const _save = () => {
					try {
						this.save();
					} catch (error) {
						(this.profile.preferences[key] as PrefRecord<K>[]) = previousRecords;
						(this.$state[key] as unknown) = previousValue;
						throw error;
					}
					if (preferencesEvents.listenerCount('committed') > 0) {
						preferencesEvents.emit('committed', { key, value: deepClone(v), oldValue });
					}
				};

				if (parseScope(record[0]).account == null && isAccountDependentKey(key) && currentAccount != null) {
					const records = this.profile.preferences[key] as PrefRecord<K>[];
					records.push([
						makeScope({
							server: host,
							account: currentAccount.id,
						}),
						v,
						{},
					]);
					_save();
					return;
				}

				if (parseScope(record[0]).server == null && isServerDependentKey(key)) {
					const records = this.profile.preferences[key] as PrefRecord<K>[];
					records.push([
						makeScope({
							server: host,
						}),
						v,
						{},
					]);
					_save();
					return;
				}

				record[1] = v;
				_save();

				if (record[2].sync) {
					queueCloudWrite(key, record);
				}
			},

			/**
			 * 特定のキーの簡易的な computed ref を作る。
			 * 主に Vue 上で設定コントロールの model として使う。
			 */
			model<K extends keyof PREF, V = ValueOf<K>>(
				key: K,
				getter?: (v: ValueOf<K>) => V,
				setter?: (v: V) => ValueOf<K>,
			): Ref<V> {
				return computed<V>({
					get: () => (getter != null ? getter(this.$state[key]) : this.$state[key]) as V,
					set: (value) => {
						const val = setter != null ? setter(value) : value;
						this.commit(key, val as ValueOf<K>);
					},
				});
			},

			async fetchCloudValues() {
				if (disposed) return;
				const epochAtStart = profileEpoch;
				const needs = [] as { key: keyof PREF; scope: Scope }[];
				const revisionsAtStart = new Map<keyof PREF, number>();
				const scopesAtStart = new Map<keyof PREF, Scope>();
				for (const _key in PREF_DEF) {
					const key = _key as keyof PREF;
					const record = this.getMatchedRecordOf(key);
					if (record[2].sync) {
						revisionsAtStart.set(key, localRevisions.get(key) ?? 0);
						const scope = { ...record[0] };
						scopesAtStart.set(key, scope);
						needs.push({ key, scope });
					}
				}
				if (needs.length === 0) return;
				const cloudValues = await trackCloud(io.cloudGetBulk({ needs }));
				if (disposed || profileEpoch !== epochAtStart || io.isCurrent?.() === false) return;
				let changed = false;
				for (const _key in PREF_DEF) {
					const key = _key as keyof PREF;
					const record = this.getMatchedRecordOf(key);
					const scopeAtStart = scopesAtStart.get(key);
					if (
						record[2].sync &&
						scopeAtStart != null &&
						isSameScope(record[0], scopeAtStart) &&
						(localRevisions.get(key) ?? 0) === (revisionsAtStart.get(key) ?? 0) &&
						Object.hasOwn(cloudValues, key) &&
						cloudValues[key] !== undefined
					) {
						const cloudValue = cloudValues[key];
						if (!deepEqual(cloudValue, record[1])) {
							const value = deepClone(cloudValue);
							(this.$state[key] as unknown) = value;
							record[1] = value;
							changed = true;
							if (_DEV_) {
								console.log('cloud fetched', key, cloudValue);
							}
						}
					}
				}

				if (changed || localSaveFailed) this.save();
				if (_DEV_) {
					console.log('cloud fetch completed');
				}
			},

			save() {
				if (disposed) throw new Error('Preferences store is disposed');
				localSaveFailed = true;
				this.profile.modifiedAt = Math.max(Date.now(), this.profile.modifiedAt + 1);
				this.profile.version = version;
				const merged = io.save({ profile: this.profile });
				localSaveFailed = false;
				if (merged != null) this._applyProfile(merged);
				preferencesEvents.emit('saved');
			},

			_applyProfile(profile: PossiblyNonNormalizedPreferencesProfile) {
				const preferences = normalizePreferences(profile.preferences, currentAccount);
				const changed = hasNormalizationChanges(profile.preferences, preferences);
				this.profile = { ...profile, preferences };
				const states = generatePreferenceValues(this.profile, currentAccount);
				for (const _key in states) {
					const key = _key as keyof PREF;
					if (!deepEqual(this.$state[key], states[key])) this._rewriteRawState(key, states[key]);
				}
				return changed;
			},

			replaceProfile(profile: PossiblyNonNormalizedPreferencesProfile) {
				if (disposed) throw new Error('Preferences store is disposed');
				profileEpoch++;
				syncOperations.clear();
				pendingCloudWrites.clear();
				const normalized = { ...profile, preferences: normalizePreferences(profile.preferences, currentAccount) };
				if (io.replace == null) throw new Error('Preferences storage cannot replace profiles');
				this._applyProfile(io.replace(normalized));
				preferencesEvents.emit('saved');
			},

			getMatchedRecordOf<K extends keyof PREF>(key: K): PrefRecord<K> {
				return getMatchedRecordFromProfile(this.profile, currentAccount, key);
			},

			isAccountOverrided<K extends keyof PREF>(key: K): boolean {
				if (currentAccount == null) {
					return false;
				}
				return this.profile.preferences[key].some(
					([scope, v]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
				);
			},

			setAccountOverride<K extends keyof PREF>(key: K) {
				if (disposed) throw new Error('Preferences store is disposed');
				if (currentAccount == null) {
					return;
				}
				if (isAccountDependentKey(key)) {
					throw new Error('already account-dependent');
				}
				if (this.isAccountOverrided(key)) {
					if (localSaveFailed) this.save();
					return;
				}

				syncOperations.delete(key);
				const records = this.profile.preferences[key] as PrefRecord<K>[];
				records.push([
					makeScope({
						server: host,
						account: currentAccount.id,
					}),
					this.$state[key] as ValueOf<K>,
					{},
				]);

				this.save();
			},

			clearAccountOverride<K extends keyof PREF>(key: K) {
				if (disposed) throw new Error('Preferences store is disposed');
				if (currentAccount == null) {
					return;
				}
				if (isAccountDependentKey(key)) {
					throw new Error('cannot clear override for this account-dependent property');
				}

				const records = this.profile.preferences[key];

				const index = records.findIndex(
					([scope, v]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
				);
				if (index === -1) {
					if (localSaveFailed) this.save();
					return;
				}

				syncOperations.delete(key);
				records.splice(index, 1);

				this._rewriteRawState(key, this.getMatchedRecordOf(key)[1]);

				this.save();
			},

			isSyncEnabled<K extends keyof PREF>(key: K): boolean {
				return this.getMatchedRecordOf(key)[2].sync ?? false;
			},

			async enableSync<K extends keyof PREF>(key: K): Promise<{ enabled: boolean } | null> {
				if (disposed) return null;
				if (this.isSyncEnabled(key)) {
					if (localSaveFailed) this.save();
					return null;
				}
				const operation = Symbol();
				syncOperations.set(key, operation);
				const epoch = profileEpoch;
				let revision = localRevisions.get(key) ?? 0;
				const record = this.getMatchedRecordOf(key);
				const ownsOperation = () =>
					!disposed &&
					profileEpoch === epoch &&
					syncOperations.get(key) === operation &&
					(localRevisions.get(key) ?? 0) === revision &&
					isSameScope(record[0], this.getMatchedRecordOf(key)[0]) &&
					io.isCurrent?.() !== false;
				const localValue = deepClone(record[1]);

				// os.ts はダイアログの部品を通して設定を読むので、静的に import すると循環する。
				const os = await import('@/os.js');
				if (!ownsOperation()) return { enabled: false };

				// undefined はキャンセルを表す。
				async function resolveConflict(local: ValueOf<K>, remote: ValueOf<K>): Promise<ValueOf<K> | undefined> {
					const merge = (PREF_DEF as PreferencesDefinition)[key]?.mergeStrategy;
					let mergedValue: ValueOf<K> | undefined = undefined; // null と区別したいため
					try {
						if (merge != null) {
							mergedValue = merge(local, remote) as ValueOf<K> | undefined;
						}
					} catch {
						// 統合できない場合も、リモート値か端末の値を選べるようにする。
					}
					const { canceled, result: choice } = await os.select({
						title: i18n.ts.preferenceSyncConflictTitle,
						text: i18n.ts.preferenceSyncConflictText,
						items: [
							...(mergedValue !== undefined
								? [
										{
											label: i18n.ts.preferenceSyncConflictChoiceMerge,
											value: 'merge' as const,
										},
									]
								: []),
							{
								label: i18n.ts.preferenceSyncConflictChoiceServer,
								value: 'remote' as const,
							},
							{
								label: i18n.ts.preferenceSyncConflictChoiceDevice,
								value: 'local' as const,
							},
							{
								label: i18n.ts.preferenceSyncConflictChoiceCancel,
								value: null,
							},
						],
						default: mergedValue !== undefined ? 'merge' : 'remote',
					});
					if (canceled || choice == null) {
						return undefined;
					}

					if (choice === 'remote') {
						return remote;
					} else if (choice === 'local') {
						return local;
					} else if (choice === 'merge') {
						return mergedValue!;
					}
					return undefined;
				}

				let newValue = localValue;
				const existing = await trackCloud(io.cloudGet({ key, scope: record[0] }));
				if (!ownsOperation()) return { enabled: false };
				if (existing != null && !deepEqual(localValue, existing.value)) {
					const resolvedValue = await resolveConflict(localValue, existing.value);
					if (!ownsOperation() || resolvedValue === undefined) return { enabled: false };
					newValue = resolvedValue;
				}

				const done = os.waiting();
				try {
					await queueCloudWrite(key, [record[0], newValue, {}], ownsOperation);
				} catch (err) {
					done();
					if (!ownsOperation()) return { enabled: false };

					os.alert({
						type: 'error',
						title: i18n.ts.somethingHappened,
					});

					console.error(err);

					return { enabled: false };
				}

				if (!ownsOperation()) {
					done();
					return { enabled: false };
				}
				this.commit(key, newValue);
				revision = localRevisions.get(key) ?? 0;
				this.getMatchedRecordOf(key)[2].sync = true;
				this.save();
				syncOperations.delete(key);
				done({ success: true });
				return { enabled: true };
			},

			disableSync<K extends keyof PREF>(key: K) {
				if (disposed) throw new Error('Preferences store is disposed');
				syncOperations.delete(key);
				if (!this.isSyncEnabled(key)) {
					if (localSaveFailed) this.save();
					return;
				}

				const record = this.getMatchedRecordOf(key);
				delete record[2].sync;
				this.save();
			},

			renameProfile(name: string) {
				if (disposed) throw new Error('Preferences store is disposed');
				this.profile.name = name;
				this.save();
			},

			reloadProfile() {
				if (disposed) return;
				syncOperations.clear();
				profileEpoch++;
				const newProfile = io.load() ?? createEmptyProfile();
				if (this._applyProfile(newProfile)) this.save();
			},

			getPerPrefMenu<K extends keyof PREF>(
				key: K,
			): {
				items: MenuItem[];
				overrideByAccount: Ref<boolean>;
				sync: Ref<boolean>;
				dispose: () => void;
			} {
				const overrideByAccount = ref(this.isAccountOverrided(key));
				const stopOverrideByAccountWatcher = watch(overrideByAccount, () => {
					if (overrideByAccount.value) {
						this.setAccountOverride(key);
					} else {
						this.clearAccountOverride(key);
					}
				});

				const sync = ref(this.isSyncEnabled(key));
				let menuRevision = 0;
				let menuDisposed = false;
				const stopSyncWatcher = watch(sync, async () => {
					const revision = ++menuRevision;
					if (!sync.value) {
						this.disableSync(key);
						return;
					}
					try {
						const result = await this.enableSync(key);
						if (!menuDisposed && revision === menuRevision && result != null && !result.enabled) sync.value = false;
					} catch (error) {
						console.error('Failed to enable preference sync', error);
						if (!menuDisposed && revision === menuRevision) sync.value = false;
					}
				});

				return {
					items: [
						{
							icon: 'ti ti-copy',
							text: i18n.ts.copyPreferenceId,
							action: () => {
								copyToClipboard(key);
							},
						},
						{
							icon: 'ti ti-refresh',
							text: i18n.ts.resetToDefaultValue,
							danger: true,
							action: () => {
								this.commit(key, getInitialPrefValue(key));
							},
						},
						{
							type: 'divider',
						},
						{
							type: 'switch',
							icon: 'ti ti-user-cog',
							text: i18n.ts.overrideByAccount,
							ref: overrideByAccount,
						},
						{
							type: 'switch',
							icon: 'ti ti-cloud-cog',
							text: i18n.ts.syncBetweenDevices,
							ref: sync,
						},
					],
					overrideByAccount,
					sync,
					dispose: () => {
						menuDisposed = true;
						menuRevision++;
						stopOverrideByAccountWatcher();
						stopSyncWatcher();
					},
				};
			},
		},
	});

	const store = usePreferencesStore(pinia);
	const cloudReady = store.fetchCloudValues().catch((error) => {
		console.error('Failed to load preferences from the cloud', error);
	});
	return Object.assign(store, {
		$preferencesCloudReady: cloudReady,
		$preferencesFlush: async () => {
			if (localSaveFailed) store.save();
			await flushCloudWrites();
		},
		$preferencesDispose: async () => {
			disposed = true;
			syncOperations.clear();
			pendingCloudWrites.clear();
			await Promise.allSettled([...cloudOperations, ...(cloudJob == null ? [] : [cloudJob])]);
		},
	});
}
