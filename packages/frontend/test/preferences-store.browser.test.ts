/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPinia } from 'pinia';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { host } from '@/shared/utility/config.js';
import type {
	PREF,
	PossiblyNonNormalizedPreferencesProfile,
	PreferencesProfile,
	Scope,
	StorageProvider,
	ValueOf,
} from '@/preferences/store.js';
import {
	createPreferencesStore,
	isPossiblyNonNormalizedPreferencesProfile,
	preferencesEvents,
} from '@/preferences/store.js';
import { createLocalPreferencesStorage, preferencesActiveStorageKey } from '@/preferences/storage.js';
import { createCloudPreferencesStorage } from '@/preferences/cloud.js';
import { nextTick } from 'vue';
import { PREF_DEF } from '@/preferences/def.js';

vi.mock('@/os.js', () => ({
	select: vi.fn(async () => ({ canceled: false, result: 'local' })),
	waiting: vi.fn(() => vi.fn()),
	alert: vi.fn(async () => {}),
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));

afterEach(() => {
	localStorage.clear();
	preferencesEvents.removeAllListeners();
});

function createProfile(
	preferences: PossiblyNonNormalizedPreferencesProfile['preferences'] = {},
): PossiblyNonNormalizedPreferencesProfile {
	return {
		id: 'profile-id',
		version: 'test',
		type: 'main',
		modifiedAt: 1,
		name: 'Test',
		preferences,
	};
}

function createStorageProvider(options?: {
	profile?: PossiblyNonNormalizedPreferencesProfile;
	cloudGetBulk?: StorageProvider['cloudGetBulk'];
}) {
	const saves: Parameters<StorageProvider['save']>[0][] = [];
	const cloudSets: { key: keyof PREF; scope: Scope; value: unknown }[] = [];
	const provider: StorageProvider = {
		load: () => options?.profile ?? createProfile(),
		save: (ctx) => {
			saves.push(JSON.parse(JSON.stringify(ctx)));
		},
		cloudGetBulk: options?.cloudGetBulk ?? (async <K extends keyof PREF>() => ({}) as Partial<Record<K, ValueOf<K>>>),
		cloudGet: async () => null,
		cloudSet: async <K extends keyof PREF>(ctx: { key: K; scope: Scope; value: ValueOf<K> }) => {
			cloudSets.push(ctx);
		},
	};
	return { provider, saves, cloudSets };
}

describe('preferences profile validation', () => {
	test('accepts a profile containing scoped preference records', () => {
		expect(
			isPossiblyNonNormalizedPreferencesProfile(
				createProfile({
					animation: [[{ server: 'example.test' }, true, { sync: true }]],
				}),
			),
		).toBe(true);
	});

	test.each([
		null,
		{},
		{ ...createProfile(), modifiedAt: Number.NaN },
		{ ...createProfile(), preferences: [] },
		{ ...createProfile(), preferences: { animation: true } },
		{ ...createProfile(), preferences: { animation: [[null, true, {}]] } },
		{ ...createProfile(), preferences: { animation: [[{}, true]] } },
		{ ...createProfile(), preferences: { animation: [[{}, true, { sync: 'yes' }]] } },
	])('rejects an invalid profile: %j', (profile) => {
		expect(isPossiblyNonNormalizedPreferencesProfile(profile)).toBe(false);
	});
});

describe('preference merge strategies', () => {
	test('merges ID-based collections while preserving order and rejecting conflicts', () => {
		const merge = PREF_DEF.emojiPalettes.mergeStrategy!;
		const first = { id: 'a', name: 'First', emojis: ['a'] };
		const second = { id: 'b', name: 'Second', emojis: ['b'] };

		expect(merge([first], [first, second])).toEqual([first, second]);
		expect(() => merge([first], [{ ...first, name: 'Changed' }])).toThrow();
	});
});

describe('Pinia preferences store', () => {
	test('uses backward-compatible defaults for the new display and draft preferences', async () => {
		const fixture = createStorageProvider();
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;

		expect(store.draftRestoreMode).toBe('always');
		expect(store.instanceTickerDisplay).toBe('normal');
		expect(store.searchEngine).toBe('google');
		expect(store.menu).toContain('quickSettings');
	});

	test('selects the account-scoped value during initialization', async () => {
		const fixture = createStorageProvider({
			profile: createProfile({
				'deck.profile': [
					[{}, null, {}],
					[{ server: host, account: 'account-a' }, 'Work', {}],
				],
			}),
		});
		const store = createPreferencesStore(fixture.provider, { id: 'account-a' }, createPinia());

		await store.$preferencesCloudReady;

		expect(store['deck.profile']).toBe('Work');
	});

	test('commits through Pinia state and writes the matching profile record', async () => {
		const fixture = createStorageProvider({
			profile: createProfile({ animation: [[{}, false, {}]] }),
		});
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;

		store.commit('animation', true);

		expect(store.animation).toBe(true);
		expect(store.profile.preferences.animation[0]?.[1]).toBe(true);
		expect(fixture.saves.at(-1)?.profile.preferences.animation[0]?.[1]).toBe(true);
	});

	test('exposes preferences as computed two-way models', async () => {
		const fixture = createStorageProvider({
			profile: createProfile({ animation: [[{}, false, {}]] }),
		});
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;
		const animation = store.model('animation');
		const reduceAnimation = store.model(
			'animation',
			(value) => !value,
			(value) => !value,
		);

		expect(animation.value).toBe(false);
		reduceAnimation.value = false;
		expect(store.animation).toBe(true);
		expect(animation.value).toBe(true);
	});

	test('does not overwrite a local commit with a late cloud response', async () => {
		const cloudResult = Promise.withResolvers<Partial<Record<keyof PREF, ValueOf<keyof PREF>>>>();
		const cloudGetBulk: StorageProvider['cloudGetBulk'] = async <K extends keyof PREF>() =>
			(await cloudResult.promise) as Partial<Record<K, ValueOf<K>>>;
		const fixture = createStorageProvider({
			profile: createProfile({ animation: [[{}, false, { sync: true }]] }),
			cloudGetBulk,
		});
		const store = createPreferencesStore(fixture.provider, null, createPinia());

		store.commit('animation', true);
		cloudResult.resolve({ animation: false });
		await store.$preferencesCloudReady;

		expect(store.animation).toBe(true);
		expect(store.profile.preferences.animation[0]?.[1]).toBe(true);
	});

	// 取得中にプロファイルが差し替わった場合、旧プロファイル向けの応答を新しいプロファイルへ書き込まない。
	test('does not apply a cloud response started for a replaced profile', async () => {
		const first = Promise.withResolvers<Partial<Record<keyof PREF, ValueOf<keyof PREF>>>>();
		let calls = 0;
		const cloudGetBulk: StorageProvider['cloudGetBulk'] = async <K extends keyof PREF>() => {
			calls++;
			return (calls === 1 ? await first.promise : {}) as Partial<Record<K, ValueOf<K>>>;
		};
		let current = { ...createProfile({ animation: [[{}, false, { sync: true }]] }), id: 'profile-a' };
		const fixture = createStorageProvider({ cloudGetBulk });
		fixture.provider.load = () => current;
		const store = createPreferencesStore(fixture.provider, null, createPinia());

		current = { ...createProfile({ animation: [[{}, true, { sync: true }]] }), id: 'profile-b' };
		store.reloadProfile();
		first.resolve({ animation: false });
		await store.$preferencesCloudReady;

		expect(store.profile.id).toBe('profile-b');
		expect(store.animation).toBe(true);
		expect(store.profile.preferences.animation[0]?.[1]).toBe(true);
	});

	test('retries an identical value after local storage fails without announcing an undurable commit', async () => {
		const fixture = createStorageProvider({ profile: createProfile({ animation: [[{}, false, {}]] }) });
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;
		const committed = vi.fn();
		preferencesEvents.on('committed', committed);
		const save = fixture.provider.save;
		fixture.provider.save = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new DOMException('Full storage', 'QuotaExceededError');
			})
			.mockImplementation(save);

		expect(() => store.commit('animation', true)).toThrow('Full storage');
		expect(store.animation).toBe(false);
		expect(committed).not.toHaveBeenCalled();
		store.commit('animation', true);
		expect(fixture.saves.at(-1)?.profile.preferences.animation[0]?.[1]).toBe(true);
		expect(committed).toHaveBeenCalledOnce();
	});

	test('serializes synced edits, retains the latest queued value, and exposes failed cloud saves for retry', async () => {
		const fixture = createStorageProvider({
			profile: createProfile({ 'sound.masterVolume': [[{}, 0.5, { sync: true }]] }),
		});
		const first = Promise.withResolvers<void>();
		const started = Promise.withResolvers<void>();
		const values: number[] = [];
		fixture.provider.cloudSet = async ({ value }) => {
			values.push(value as number);
			if (values.length === 1) {
				started.resolve();
				await first.promise;
			}
		};
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;
		store.commit('sound.masterVolume', 0.1);
		await started.promise;
		store.commit('sound.masterVolume', 0.2);
		store.commit('sound.masterVolume', 0.3);
		first.resolve();
		await store.$preferencesFlush();
		expect(values).toEqual([0.1, 0.3]);
		fixture.provider.cloudSet = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		store.commit('sound.masterVolume', 0.4);
		await expect(store.$preferencesFlush()).rejects.toThrow('Offline');
		await store.$preferencesFlush();
		expect(fixture.provider.cloudSet).toHaveBeenLastCalledWith({ key: 'sound.masterVolume', scope: {}, value: 0.4 });
		logged.mockRestore();
	});

	test.each(['off', 'edit', 'override', 'reload'] as const)(
		'%s takes ownership from a pending sync enable',
		async (change) => {
			const fixture = createStorageProvider({ profile: createProfile({ animation: [[{}, false, {}]] }) });
			const response = Promise.withResolvers<{ value: boolean } | null>();
			const started = Promise.withResolvers<void>();
			fixture.provider.cloudGet = async <K extends keyof PREF>() => {
				started.resolve();
				return (await response.promise) as { value: ValueOf<K> } | null;
			};
			const store = createPreferencesStore(fixture.provider, { id: 'account-a' }, createPinia());
			await store.$preferencesCloudReady;
			const enable = store.enableSync('animation');
			await started.promise;
			if (change === 'off') store.disableSync('animation');
			if (change === 'edit') store.commit('animation', true);
			if (change === 'override') store.setAccountOverride('animation');
			if (change === 'reload') store.reloadProfile();
			response.resolve({ value: false });
			expect(await enable).toEqual({ enabled: false });
			expect(store.animation).toBe(change === 'edit');
			expect(store.isSyncEnabled('animation')).toBe(false);
			expect(fixture.cloudSets).toEqual([]);
		},
	);

	test('reload accepts peer changes without fetching an older cloud value or resaving an unchanged profile', async () => {
		const fixture = createStorageProvider({ profile: createProfile({ animation: [[{}, false, { sync: true }]] }) });
		let current = fixture.provider.load()!;
		fixture.provider.load = () => current;
		const bulk = vi.fn();
		const getBulk = fixture.provider.cloudGetBulk;
		fixture.provider.cloudGetBulk = (ctx) => {
			bulk(ctx);
			return getBulk(ctx);
		};
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;
		current = {
			...store.profile,
			name: 'Peer',
			preferences: { ...store.profile.preferences, animation: [[{}, true, { sync: true }]] },
		};
		const saveCount = fixture.saves.length;
		store.reloadProfile();
		expect(store.animation).toBe(true);
		expect(store.profile.name).toBe('Peer');
		expect(bulk).toHaveBeenCalledOnce();
		expect(fixture.saves).toHaveLength(saveCount);
		const serverProfile: PreferencesProfile = {
			...store.profile,
			preferences: { ...store.profile.preferences, animation: [[{}, true, { sync: true }]] },
		};
		fixture.provider.cloudGetBulk = async <K extends keyof PREF>({ needs }: { needs: { key: K; scope: Scope }[] }) => {
			bulk({ needs });
			const values: Partial<Record<K, ValueOf<K>>> = {};
			for (const { key } of needs) {
				const record = serverProfile.preferences[key][0];
				if (record != null) values[key] = record[1];
			}
			return values;
		};
		await store.fetchCloudValues();
		expect(fixture.saves).toHaveLength(saveCount);
	});

	test('per-scope local saves preserve concurrent profile metadata, keys, and other account overrides', async () => {
		const cloud = createStorageProvider().provider;
		const storageA = createLocalPreferencesStorage(localStorage);
		const a = createPreferencesStore({ ...cloud, ...storageA }, { id: 'account-a' }, createPinia());
		await a.$preferencesCloudReady;
		const storageB = createLocalPreferencesStorage(localStorage);
		const b = createPreferencesStore({ ...cloud, ...storageB }, { id: 'account-b' }, createPinia());
		await b.$preferencesCloudReady;
		a.renameProfile('Peer name');
		a.setAccountOverride('animation');
		a.commit('animation', false);
		b.commit('sound.masterVolume', 0.25);
		b.setAccountOverride('animation');
		b.commit('animation', true);
		const saved = storageA.load()!;
		expect(saved.name).toBe('Peer name');
		expect(saved.preferences['sound.masterVolume']?.[0]?.[1]).toBe(0.25);
		expect(saved.preferences['animation']?.find(([scope]) => scope.account === 'account-a')?.[1]).toBe(false);
		expect(saved.preferences['animation']?.find(([scope]) => scope.account === 'account-b')?.[1]).toBe(true);
	});

	test('terminal disposal drains started IO and discards late hydration without repopulating cleared preferences', async () => {
		const response = Promise.withResolvers<Partial<Record<keyof PREF, ValueOf<keyof PREF>>>>();
		const fixture = createStorageProvider({
			profile: createProfile({ animation: [[{}, false, { sync: true }]] }),
			cloudGetBulk: async <K extends keyof PREF>() => (await response.promise) as Partial<Record<K, ValueOf<K>>>,
		});
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		const disposal = store.$preferencesDispose();
		const savedBefore = fixture.saves.length;
		response.resolve({ animation: true });
		await disposal;
		expect(() => store.commit('animation', true)).toThrow('disposed');
		expect(() => store.renameProfile('After signout')).toThrow('disposed');
		expect(store.animation).toBe(false);
		expect(fixture.saves).toHaveLength(savedBefore);
	});

	test('keeps input, state, profile and event snapshots independent and emits nothing for equal values', async () => {
		const fixture = createStorageProvider();
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		await store.$preferencesCloudReady;
		const events: { value: ValueOf<'emojiPalettes'>; oldValue: ValueOf<'emojiPalettes'> }[] = [];
		preferencesEvents.on('committed', (event) => {
			if (event.key === 'emojiPalettes') events.push(event as (typeof events)[number]);
		});
		const value = [{ id: 'test', name: 'Original', emojis: ['a'] }];
		store.commit('emojiPalettes', value);
		store.commit('emojiPalettes', value);
		value[0]!.name = 'Input mutation';
		events[0]!.value[0]!.name = 'Event mutation';
		expect(store.emojiPalettes[0]?.name).toBe('Original');
		expect(store.profile.preferences.emojiPalettes[0]?.[1][0]?.name).toBe('Original');
		store.emojiPalettes[0]!.name = 'State mutation';
		expect(store.profile.preferences.emojiPalettes[0]?.[1][0]?.name).toBe('Original');
		expect(events).toHaveLength(1);
	});

	test('retains initialized preferences after a quota failure and flush explicitly retries normalization', async () => {
		const fixture = createStorageProvider();
		const save = fixture.provider.save;
		fixture.provider.save = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new DOMException('Full storage', 'QuotaExceededError');
			})
			.mockImplementation(save);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createPreferencesStore(fixture.provider, null, createPinia());
		expect(store.animation).toBeTypeOf('boolean');
		await store.$preferencesFlush();
		expect(fixture.saves.at(-1)?.profile.preferences.animation).toEqual(store.profile.preferences.animation);
		expect(logged).toHaveBeenCalled();
		logged.mockRestore();
	});

	test('disposing a preference menu stops later switch mutations without abandoning an accepted setting', async () => {
		const fixture = createStorageProvider();
		const store = createPreferencesStore(fixture.provider, { id: 'account-a' }, createPinia());
		await store.$preferencesCloudReady;
		const menu = store.getPerPrefMenu('animation');
		menu.overrideByAccount.value = true;
		await nextTick();
		expect(store.isAccountOverrided('animation')).toBe(true);
		menu.dispose();
		menu.dispose();
		menu.overrideByAccount.value = false;
		menu.sync.value = true;
		await nextTick();
		expect(store.isAccountOverrided('animation')).toBe(true);
		expect(store.isSyncEnabled('animation')).toBe(false);
	});

	test('independent registry clients retain concurrently saved scopes and canonical null scopes', async () => {
		const registry = new Map<string, unknown>();
		const firstWrite = Promise.withResolvers<void>();
		const firstStarted = Promise.withResolvers<void>();
		let writing = 0;
		const api: NonNullable<Parameters<typeof createCloudPreferencesStorage>[1]> = async (endpoint, data, token) => {
			const id = JSON.stringify([token, data.scope, data.key]);
			if (endpoint === 'i/registry/set') {
				if (++writing === 1) {
					firstStarted.resolve();
					await firstWrite.promise;
				}
				registry.set(id, data.value);
				return undefined;
			}
			if (!registry.has(id)) throw { code: 'NO_SUCH_KEY' };
			return registry.get(id);
		};
		const first = createCloudPreferencesStorage('account-a-token', api);
		const second = createCloudPreferencesStorage('account-a-token', api);
		const pending = first.cloudSet({ key: 'sound.masterVolume', scope: { server: 'one.test' }, value: 0.1 });
		await firstStarted.promise;
		await second.cloudSet({ key: 'sound.masterVolume', scope: { server: 'two.test' }, value: 0.9 });
		firstWrite.resolve();
		await pending;
		expect(await first.cloudGet({ key: 'sound.masterVolume', scope: { server: 'one.test', account: null } })).toEqual({
			value: 0.1,
		});
		expect(await second.cloudGet({ key: 'sound.masterVolume', scope: { server: 'two.test' } })).toEqual({ value: 0.9 });
		const otherAccount = createCloudPreferencesStorage('account-b-token', api);
		expect(await otherAccount.cloudGet({ key: 'sound.masterVolume', scope: { server: 'one.test' } })).toBeNull();
	});

	test('profile storage preserves fallback precedence and duplicate scoped records independently of native key enumeration', async () => {
		const storage = createLocalPreferencesStorage(localStorage);
		const cloud = createStorageProvider().provider;
		const store = createPreferencesStore({ ...cloud, ...storage }, null, createPinia());
		await store.$preferencesCloudReady;
		const profile: PreferencesProfile = {
			...store.profile,
			preferences: {
				...store.profile.preferences,
				animation: [
					[{ server: 'first.test' }, true, {}],
					[{ server: 'second.test' }, false, {}],
					[{ server: 'first.test' }, false, { sync: true }],
				],
			},
		};
		storage.replace(profile);
		expect(storage.load()?.preferences['animation']).toEqual(profile.preferences.animation);
		store.reloadProfile();
		expect(store.animation).toBe(true);
	});

	test('own commits preserve hydration of unchanged keys without accepting a response for a former scope', async () => {
		const storage = createLocalPreferencesStorage(localStorage);
		const fixture = createStorageProvider();
		const seed = createPreferencesStore({ ...fixture.provider, ...storage }, { id: 'account-a' }, createPinia());
		await seed.$preferencesCloudReady;
		const profile: PreferencesProfile = {
			...seed.profile,
			preferences: {
				...seed.profile.preferences,
				animation: [[{}, false, { sync: true }]],
				'sound.masterVolume': [[{}, 0.5, { sync: true }]],
				useBlurEffect: [[{}, false, { sync: true }]],
			},
		};
		storage.replace(profile);
		const response = Promise.withResolvers<Partial<Record<keyof PREF, ValueOf<keyof PREF>>>>();
		const store = createPreferencesStore(
			{
				...fixture.provider,
				...storage,
				cloudGetBulk: async <K extends keyof PREF>() => (await response.promise) as Partial<Record<K, ValueOf<K>>>,
			},
			{ id: 'account-a' },
			createPinia(),
		);
		store.commit('sound.masterVolume', 0.75);
		store.setAccountOverride('animation');
		expect(await store.enableSync('animation')).toEqual({ enabled: true });
		response.resolve({ animation: true, 'sound.masterVolume': 0.25, useBlurEffect: true });
		await store.$preferencesCloudReady;
		expect(store.animation).toBe(false);
		expect(store['sound.masterVolume']).toBe(0.75);
		expect(store.useBlurEffect).toBe(true);
		expect(store.isSyncEnabled('animation')).toBe(true);
	});

	test('same override and sync toggle retries persist metadata after a quota failure', async () => {
		const fixture = createStorageProvider({ profile: createProfile({ animation: [[{}, false, {}]] }) });
		const store = createPreferencesStore(fixture.provider, { id: 'account-a' }, createPinia());
		await store.$preferencesCloudReady;
		const save = fixture.provider.save;
		fixture.provider.save = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new DOMException('Full storage', 'QuotaExceededError');
			})
			.mockImplementation(save);
		expect(() => store.setAccountOverride('animation')).toThrow('Full storage');
		expect(fixture.saves.at(-1)?.profile.preferences.animation.some(([scope]) => scope.account === 'account-a')).toBe(
			false,
		);
		store.setAccountOverride('animation');
		expect(fixture.saves.at(-1)?.profile.preferences.animation.some(([scope]) => scope.account === 'account-a')).toBe(
			true,
		);
		expect(await store.enableSync('animation')).toEqual({ enabled: true });
		fixture.provider.save = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new DOMException('Full storage', 'QuotaExceededError');
			})
			.mockImplementation(save);
		expect(() => store.disableSync('animation')).toThrow('Full storage');
		store.disableSync('animation');
		expect(
			fixture.saves.at(-1)?.profile.preferences.animation.find(([scope]) => scope.account === 'account-a')?.[2].sync,
		).toBeUndefined();
	});

	test('a failed profile replacement keeps the old complete profile and does not retain partial staging keys', async () => {
		const storage = createLocalPreferencesStorage(localStorage);
		const store = createPreferencesStore({ ...createStorageProvider().provider, ...storage }, null, createPinia());
		await store.$preferencesCloudReady;
		const snapshot = Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b));
		const setItem = Storage.prototype.setItem;
		let fail = true;
		const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
			this: Storage,
			key: string,
			value: string,
		) {
			if (key === preferencesActiveStorageKey && fail) {
				fail = false;
				throw new DOMException('Full storage', 'QuotaExceededError');
			}
			setItem.call(this, key, value);
		});
		try {
			expect(() => storage.replace({ ...store.profile, name: 'Replacement' })).toThrow('Full storage');
			expect(storage.load()?.name).toBe(store.profile.name);
			expect(Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))).toEqual(snapshot);
			storage.replace({ ...store.profile, name: 'Replacement' });
			expect(storage.load()?.name).toBe('Replacement');
		} finally {
			failure.mockRestore();
		}
	});
});
