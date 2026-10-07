/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi } from '@/utility/misskey-api.js';
import { preferenceScopeKey } from './storage.js';
import type { PREF, Scope, StorageProvider, ValueOf } from './store.js';

type PreferenceRegistryApi = (
	endpoint: 'i/registry/get' | 'i/registry/set',
	data: { scope: string[]; key: string; value?: unknown },
	token: string | null,
) => Promise<unknown>;

export function createCloudPreferencesStorage(
	token: string | null,
	api: PreferenceRegistryApi = misskeyApi,
): Pick<StorageProvider, 'cloudGet' | 'cloudSet' | 'cloudGetBulk'> {
	const cloudGet = async <K extends keyof PREF>(ctx: {
		key: K;
		scope: Scope;
	}): Promise<{ value: ValueOf<K> } | null> => {
		try {
			const value = await api(
				'i/registry/get',
				{
					scope: ['client', 'preferences', 'sync'],
					key: JSON.stringify(['default', ctx.key, preferenceScopeKey(ctx.scope)]),
				},
				token,
			);
			return { value: value as ValueOf<K> };
		} catch (error) {
			if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'NO_SUCH_KEY') return null;
			throw error;
		}
	};

	return {
		cloudGet,
		cloudSet: async (ctx) => {
			// registry はキー単位で保存する。異なる端末の別スコープも全体リストの上書きに巻き込まない。
			await api(
				'i/registry/set',
				{
					scope: ['client', 'preferences', 'sync'],
					key: JSON.stringify(['default', ctx.key, preferenceScopeKey(ctx.scope)]),
					value: ctx.value,
				},
				token,
			);
		},
		cloudGetBulk: async <K extends keyof PREF>({ needs }: { needs: { key: K; scope: Scope }[] }) => {
			const values = await Promise.all(needs.map(async (need) => [need.key, await cloudGet(need)] as const));
			const result: Partial<Record<K, ValueOf<K>>> = {};
			for (const [key, record] of values) {
				if (record != null) result[key] = record.value;
			}
			return result;
		},
	};
}
