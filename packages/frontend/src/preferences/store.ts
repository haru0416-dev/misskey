/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, watch } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { defineStore } from 'pinia';
import { host, version } from '@shared/utility/config.js';
import { PREF_DEF } from './def.js';
import type { Ref } from 'vue';
import type { Pinia } from 'pinia';
import type { MenuItem } from '@/types/menu.js';
import { genId } from '@/utility/id.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepClone } from '@/utility/clone.js';
import type { Cloneable } from '@/utility/clone.js';

// NOTE: 明示的な設定値のひとつとして null もあり得るため、設定が存在しないかどうかを判定する目的で null で比較したり ?? を使ってはいけない

export type PREF = typeof PREF_DEF;
type DefaultValues = {
	[K in keyof PREF]: PREF[K]['default'] extends () => infer R ? R : PREF[K]['default'];
};
export type ValueOf<K extends keyof PREF> = DefaultValues[K];

export type Scope = Partial<{
	server: string | null; // host
	account: string | null; // userId
	device: string | null; // 将来のため
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
	if (scope.server != null) c.server = scope.server;
	if (scope.account != null) c.account = scope.account;
	if (scope.device != null) c.device = scope.device;
	return c;
}

export function isSameScope(a: Scope, b: Scope): boolean {
	// null と undefined (キー無し) は区別したくないので == で比較
	// eslint-disable-next-line eqeqeq
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
	if (!isRecord(value)) return false;
	const scope = value as ScopeCandidate;
	return isNullableString(scope.server) && isNullableString(scope.account) && isNullableString(scope.device);
}

function isValueMeta(value: unknown): value is ValueMeta {
	if (!isRecord(value)) return false;
	const meta = value as ValueMetaCandidate;
	return meta.sync === undefined || typeof meta.sync === 'boolean';
}

function isPreferenceRecord(value: unknown): value is [scope: Scope, value: unknown, meta: ValueMeta] {
	return Array.isArray(value) && value.length === 3 && isScope(value[0]) && isValueMeta(value[2]);
}

export function isPossiblyNonNormalizedPreferencesProfile(
	value: unknown,
): value is PossiblyNonNormalizedPreferencesProfile {
	if (!isRecord(value)) return false;
	const profile = value as PreferencesProfileCandidate;
	if (!isRecord(profile.preferences)) return false;

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
	save: (ctx: { profile: PreferencesProfile }) => void;
	cloudGetBulk: <K extends keyof PREF>(ctx: {
		needs: { key: K; scope: Scope }[];
	}) => Promise<Partial<Record<K, ValueOf<K>>>>;
	cloudGet: <K extends keyof PREF>(ctx: { key: K; scope: Scope }) => Promise<{ value: ValueOf<K> } | null>;
	cloudSet: <K extends keyof PREF>(ctx: { key: K; scope: Scope; value: ValueOf<K> }) => Promise<void>;
};

type PreferencesDefinitionRecord<Default, T = Default extends () => infer R ? R : Default> = {
	default: Default;
	accountDependent?: boolean;
	serverDependent?: boolean;
	mergeStrategy?: (a: T, b: T) => T;
};

export type PreferencesDefinition = Record<string, PreferencesDefinitionRecord<unknown>>;

type PreferencesStoreEvents = {
	committed: <K extends keyof PREF>(ctx: { key: K; value: ValueOf<K>; oldValue: ValueOf<K> }) => void;
	saved: () => void;
};

export const preferencesEvents = new EventEmitter<PreferencesStoreEvents>();

export function definePreferences<T extends Record<string, unknown>>(x: {
	[K in keyof T]: PreferencesDefinitionRecord<T[K]>;
}): {
	[K in keyof T]: PreferencesDefinitionRecord<T[K]>;
} {
	return x;
}

export function getInitialPrefValue<K extends keyof PREF>(k: K): ValueOf<K> {
	const _default = PREF_DEF[k].default;
	if (typeof _default === 'function') {
		// factory
		return _default() as ValueOf<K>;
	} else {
		// 参照渡しになるのを防ぐためclone
		return deepClone(_default as unknown as ValueOf<K>);
	}
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
		version: version,
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

function getMatchedRecordFromProfile<K extends keyof PREF>(
	profile: PreferencesProfile,
	currentAccount: { id: string } | null,
	key: K,
): PrefRecord<K> {
	const records = profile.preferences[key];

	if (currentAccount == null) {
		const record = records.find(([scope]) => parseScope(scope).account == null);
		if (record == null) throw new Error(`no record found for key: ${key}`);
		return record;
	}

	const accountOverrideRecord = records.find(
		([scope]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
	);
	if (accountOverrideRecord) return accountOverrideRecord;

	const serverOverrideRecord = records.find(
		([scope]) => parseScope(scope).server === host && parseScope(scope).account == null,
	);
	if (serverOverrideRecord) return serverOverrideRecord;

	const record = records.find(([scope]) => parseScope(scope).account == null);
	if (record == null) throw new Error(`no record found for key: ${key}`);
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
): PreferencesStoreState {
	const loadedProfile = io.load() ?? createEmptyProfile();
	const profile: PreferencesProfile = {
		...loadedProfile,
		preferences: normalizePreferences(loadedProfile.preferences, currentAccount),
	};

	if (!deepEqual(loadedProfile as unknown as Parameters<typeof deepEqual>[0], profile)) {
		io.save({ profile });
	}

	return {
		...generatePreferenceValues(profile, currentAccount),
		profile,
	};
}

// TODO: PreferencesStoreForGuest のような非ログイン専用storeを分離すればcurrentAccountのnullチェックやaccountがnullであるスコープのレコード挿入などが不要になり綺麗になるかもしれない
//       と思ったけど操作アカウントが存在しない場合も考慮する現在の設計の方が汎用的かつ堅牢かもしれない
// NOTE: accountDependentな設定は初期状態であってもアカウントごとのスコープでレコードを作成しておかないと、サーバー同期する際に正しく動作しなくなる
export function createPreferencesStore(io: StorageProvider, currentAccount: { id: string } | null, pinia: Pinia) {
	const localRevisions = new Map<keyof PREF, number>();
	const usePreferencesStore = defineStore('preferences', {
		state: () => createPreferencesStoreState(io, currentAccount),
		actions: {
			_rewriteRawState<K extends keyof PREF>(key: K, value: ValueOf<K>) {
				const v = deepClone(value as Cloneable) as ValueOf<K>; // deep copy 兼 vueのプロキシ解除
				(this.$state[key] as unknown) = v;
			},

			commit<K extends keyof PREF>(key: K, value: ValueOf<K>) {
				const v = deepClone(value as Cloneable) as ValueOf<K>; // deep copy 兼 vueのプロキシ解除

				if (deepEqual(this.$state[key], v)) {
					if (_DEV_) console.log('(skip) prefer:commit', key, v);
					return;
				}

				if (_DEV_) console.log('prefer:commit', key, v);

				const oldValue = deepClone(this.$state[key] as ValueOf<K>);
				localRevisions.set(key, (localRevisions.get(key) ?? 0) + 1);
				this._rewriteRawState(key, v);

				const record = this.getMatchedRecordOf(key);

				const _save = () => {
					this.save();
					preferencesEvents.emit('committed', {
						key,
						value: v,
						oldValue,
					});
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
					// awaitの必要なし
					// TODO: リクエストを間引く
					io.cloudSet({ key, scope: record[0], value: record[1] });
				}
			},

			/**
			 * 特定のキーの、簡易的なcomputed refを作ります
			 * 主にvue上で設定コントロールのmodelとして使う用
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
				const needs = [] as { key: keyof PREF; scope: Scope }[];
				const revisionsAtStart = new Map<keyof PREF, number>();
				for (const _key in PREF_DEF) {
					const key = _key as keyof PREF;
					const record = this.getMatchedRecordOf(key);
					if (record[2].sync) {
						revisionsAtStart.set(key, localRevisions.get(key) ?? 0);
						needs.push({
							key,
							scope: record[0],
						});
					}
				}

				const cloudValues = await io.cloudGetBulk({ needs });

				for (const _key in PREF_DEF) {
					const key = _key as keyof PREF;
					const record = this.getMatchedRecordOf(key);
					if (
						record[2].sync &&
						(localRevisions.get(key) ?? 0) === (revisionsAtStart.get(key) ?? 0) &&
						Object.hasOwn(cloudValues, key) &&
						cloudValues[key] !== undefined
					) {
						const cloudValue = cloudValues[key];
						if (!deepEqual(cloudValue, record[1])) {
							this._rewriteRawState(key, cloudValue);
							record[1] = cloudValue;
							if (_DEV_) console.log('cloud fetched', key, cloudValue);
						}
					}
				}

				this.save();
				if (_DEV_) console.log('cloud fetch completed');
			},

			save() {
				this.profile.modifiedAt = Date.now();
				this.profile.version = version;
				io.save({ profile: this.profile });
				preferencesEvents.emit('saved');
			},

			getMatchedRecordOf<K extends keyof PREF>(key: K): PrefRecord<K> {
				return getMatchedRecordFromProfile(this.profile, currentAccount, key);
			},

			isAccountOverrided<K extends keyof PREF>(key: K): boolean {
				if (currentAccount == null) return false;
				return this.profile.preferences[key].some(
					([scope, v]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
				);
			},

			setAccountOverride<K extends keyof PREF>(key: K) {
				if (currentAccount == null) return;
				if (isAccountDependentKey(key)) throw new Error('already account-dependent');
				if (this.isAccountOverrided(key)) return;

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
				if (currentAccount == null) return;
				if (isAccountDependentKey(key)) throw new Error('cannot clear override for this account-dependent property');

				const records = this.profile.preferences[key];

				const index = records.findIndex(
					([scope, v]) => parseScope(scope).server === host && parseScope(scope).account === currentAccount.id,
				);
				if (index === -1) return;

				records.splice(index, 1);

				this._rewriteRawState(key, this.getMatchedRecordOf(key)[1]);

				this.save();
			},

			isSyncEnabled<K extends keyof PREF>(key: K): boolean {
				return this.getMatchedRecordOf(key)[2].sync ?? false;
			},

			async enableSync<K extends keyof PREF>(key: K): Promise<{ enabled: boolean } | null> {
				if (this.isSyncEnabled(key)) return Promise.resolve(null);

				// undefined ... cancel
				async function resolveConflict(local: ValueOf<K>, remote: ValueOf<K>): Promise<ValueOf<K> | undefined> {
					const merge = (PREF_DEF as PreferencesDefinition)[key]?.mergeStrategy;
					let mergedValue: ValueOf<K> | undefined = undefined; // null と区別したいため
					try {
						if (merge != null) mergedValue = merge(local, remote) as ValueOf<K> | undefined;
					} catch (_) {
						// nop
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
					if (canceled || choice == null) return undefined;

					if (choice === 'remote') {
						return remote;
					} else if (choice === 'local') {
						return local;
					} else if (choice === 'merge') {
						return mergedValue!;
					} else {
						// TSを黙らすため
						return undefined;
					}
				}

				const record = this.getMatchedRecordOf(key);

				let newValue = record[1];

				const existing = await io.cloudGet({ key, scope: record[0] });
				if (existing != null && !deepEqual(record[1], existing.value)) {
					const resolvedValue = await resolveConflict(record[1], existing.value);
					if (resolvedValue === undefined) return { enabled: false }; // canceled
					newValue = resolvedValue;
				}

				this.commit(key, newValue);

				const done = os.waiting();

				try {
					await io.cloudSet({ key, scope: record[0], value: newValue });
				} catch (err) {
					done();

					os.alert({
						type: 'error',
						title: i18n.ts.somethingHappened,
					});

					console.error(err);

					return { enabled: false };
				}

				done({ success: true });

				record[2].sync = true;
				this.save();

				return { enabled: true };
			},

			disableSync<K extends keyof PREF>(key: K) {
				if (!this.isSyncEnabled(key)) return;

				const record = this.getMatchedRecordOf(key);
				delete record[2].sync;
				this.save();
			},

			renameProfile(name: string) {
				this.profile.name = name;
				this.save();
			},

			reloadProfile() {
				const newProfile = io.load();
				if (newProfile == null) return;

				this.profile = {
					...newProfile,
					preferences: normalizePreferences(newProfile.preferences, currentAccount),
				};
				const states = generatePreferenceValues(this.profile, currentAccount);
				for (const _key in states) {
					const key = _key as keyof PREF;
					this._rewriteRawState(key, states[key]);
				}

				void this.fetchCloudValues().catch((error) => {
					console.error('Failed to reload preferences from the cloud', error);
				});
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
				const stopSyncWatcher = watch(sync, () => {
					if (sync.value) {
						this.enableSync(key).then((res) => {
							if (res == null) return;
							if (!res.enabled) sync.value = false;
						});
					} else {
						this.disableSync(key);
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
	return Object.assign(store, { $preferencesCloudReady: cloudReady });
}
