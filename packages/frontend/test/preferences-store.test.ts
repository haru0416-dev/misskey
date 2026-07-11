/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPinia } from 'pinia';
import { describe, expect, test } from 'vitest';
import { host } from '@shared/utility/config.js';
import type {
	PREF,
	PossiblyNonNormalizedPreferencesProfile,
	Scope,
	StorageProvider,
	ValueOf,
} from '@/preferences/store.js';
import { createPreferencesStore, isPossiblyNonNormalizedPreferencesProfile } from '@/preferences/store.js';

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
		expect(isPossiblyNonNormalizedPreferencesProfile(createProfile({
			animation: [[{ server: 'example.test' }, true, { sync: true }]],
		}))).toBe(true);
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
	])('rejects an invalid profile: %j', profile => {
		expect(isPossiblyNonNormalizedPreferencesProfile(profile)).toBe(false);
	});
});

describe('Pinia preferences store', () => {
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
		expect(store.profile.preferences.animation[0][1]).toBe(true);
		expect(fixture.saves.at(-1)?.profile.preferences.animation[0][1]).toBe(true);
	});

	test('does not overwrite a local commit with a late cloud response', async () => {
		let resolveCloud!: (value: Partial<Record<keyof PREF, ValueOf<keyof PREF>>>) => void;
		const cloudResult = new Promise<Partial<Record<keyof PREF, ValueOf<keyof PREF>>>>((resolve) => {
			resolveCloud = resolve;
		});
		const cloudGetBulk: StorageProvider['cloudGetBulk'] = async <K extends keyof PREF>() =>
			(await cloudResult) as Partial<Record<K, ValueOf<K>>>;
		const fixture = createStorageProvider({
			profile: createProfile({ animation: [[{}, false, { sync: true }]] }),
			cloudGetBulk,
		});
		const store = createPreferencesStore(fixture.provider, null, createPinia());

		store.commit('animation', true);
		resolveCloud({ animation: false });
		await store.$preferencesCloudReady;

		expect(store.animation).toBe(true);
		expect(store.profile.preferences.animation[0][1]).toBe(true);
	});
});
