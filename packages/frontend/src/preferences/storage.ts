/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isPossiblyNonNormalizedPreferencesProfile } from './store.js';
import type { PossiblyNonNormalizedPreferencesProfile, PreferencesProfile, Scope } from './store.js';
import { getStorageItemAsJson } from '@/local-storage.js';

export const preferencesStoragePrefix = 'preferences:';
export const preferencesActiveStorageKey = `${preferencesStoragePrefix}active`;

export function preferenceScopeKey(scope: Scope): string {
	return JSON.stringify([scope.server ?? null, scope.account ?? null, scope.device ?? null]);
}

function flattenProfile(profile: PossiblyNonNormalizedPreferencesProfile): Map<string, string> {
	const entries = new Map<string, string>();
	for (const key of ['id', 'version', 'type', 'name', 'modifiedAt'] as const) {
		entries.set(`meta:${key}`, JSON.stringify(profile[key]));
	}
	for (const [key, records] of Object.entries(profile.preferences)) {
		const order: string[] = [];
		const occurrences = new Map<string, number>();
		for (const record of records) {
			const scope = preferenceScopeKey(record[0]);
			const occurrence = occurrences.get(scope) ?? 0;
			occurrences.set(scope, occurrence + 1);
			const identity = `record:${JSON.stringify([key, scope, occurrence])}`;
			entries.set(identity, JSON.stringify(record));
			order.push(identity);
		}
		entries.set(`order:${key}`, JSON.stringify(order));
	}
	return entries;
}

// スコープごとに独立したキーを持ち、読込時の差分だけを書き戻す。別タブの別スコープを全体保存で消さない。
export function createLocalPreferencesStorage(storage: Storage) {
	let generation: string | null = null;
	let snapshot = new Map<string, string>();

	function readProfile(): { profile: PossiblyNonNormalizedPreferencesProfile | null; entries: Map<string, string> } {
		const active = storage.getItem(preferencesActiveStorageKey);
		const entries = new Map<string, string>();
		if (active == null) return { profile: null, entries };
		const prefix = `${preferencesStoragePrefix}${active}:`;
		const preferences: Record<string, unknown[]> = Object.create(null);
		const profile: Record<string, unknown> = { preferences };
		const records = new Map<string, Map<string, unknown>>();
		const orders = new Map<string, string[]>();
		const storageKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
		for (const storageKey of storageKeys) {
			if (storageKey == null || !storageKey.startsWith(prefix)) continue;
			const key = storageKey.slice(prefix.length);
			const value = getStorageItemAsJson(storage, storageKey);
			if (value === undefined) continue;
			entries.set(key, JSON.stringify(value));
			if (key.startsWith('meta:') && ['id', 'version', 'type', 'name', 'modifiedAt'].includes(key.slice(5))) {
				profile[key.slice(5)] = value;
			} else if (
				key.startsWith('order:') &&
				Array.isArray(value) &&
				value.every((entry) => typeof entry === 'string')
			) {
				orders.set(key.slice(6), value);
			} else if (key.startsWith('record:')) {
				let identity: unknown;
				try {
					identity = JSON.parse(key.slice(7));
				} catch {
					continue;
				}
				if (!Array.isArray(identity) || typeof identity[0] !== 'string') continue;
				let scopedRecords = records.get(identity[0]);
				if (scopedRecords == null) {
					scopedRecords = new Map();
					records.set(identity[0], scopedRecords);
				}
				scopedRecords.set(key, value);
			}
		}
		for (const [key, scopedRecords] of records) {
			const values: unknown[] = [];
			for (const identity of orders.get(key) ?? []) {
				if (!scopedRecords.has(identity)) continue;
				values.push(scopedRecords.get(identity));
				scopedRecords.delete(identity);
			}
			// 同時追加されたスコープは順序表に無くても保持する。既存の先頭レコードの優先順位は変えない。
			for (const [, value] of [...scopedRecords].sort(([a], [b]) => a.localeCompare(b))) values.push(value);
			preferences[key] = values;
		}
		return { profile: isPossiblyNonNormalizedPreferencesProfile(profile) ? profile : null, entries };
	}

	function load() {
		const result = readProfile();
		generation = storage.getItem(preferencesActiveStorageKey);
		snapshot = result.entries;
		return result.profile;
	}

	function replace(profile: PreferencesProfile) {
		const entropy = crypto.getRandomValues(new Uint32Array(4));
		const nextGeneration = `${entropy[0]!.toString(16)}-${entropy[1]!.toString(16)}-${entropy[2]!.toString(16)}-${entropy[3]!.toString(16)}`;
		const next = flattenProfile(profile);
		const prefix = `${preferencesStoragePrefix}${nextGeneration}:`;
		try {
			for (const [key, value] of next) storage.setItem(prefix + key, value);
			storage.setItem(preferencesActiveStorageKey, nextGeneration);
		} catch (error) {
			for (const key of next.keys()) storage.removeItem(prefix + key);
			throw error;
		}
		const oldGeneration = generation;
		generation = nextGeneration;
		snapshot = next;
		if (oldGeneration != null && oldGeneration !== nextGeneration) {
			const oldPrefix = `${preferencesStoragePrefix}${oldGeneration}:`;
			const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
			for (const key of keys) {
				if (key?.startsWith(oldPrefix)) storage.removeItem(key);
			}
		}
		return profile;
	}

	function save({ profile }: { profile: PreferencesProfile }): PreferencesProfile {
		if (storage.getItem(preferencesActiveStorageKey) !== generation)
			throw new Error('Preferences profile was replaced in another tab');
		if (generation == null) return replace(profile);
		const next = flattenProfile(profile);
		const prefix = `${preferencesStoragePrefix}${generation}:`;
		for (const [key, value] of next) {
			if (snapshot.get(key) !== value) storage.setItem(prefix + key, value);
		}
		for (const key of snapshot.keys()) {
			if (!next.has(key)) storage.removeItem(prefix + key);
		}
		const result = readProfile();
		if (result.profile == null) throw new Error('Preferences profile could not be read after saving');
		snapshot = result.entries;
		return result.profile as PreferencesProfile;
	}

	function isCurrent() {
		if (storage.getItem(preferencesActiveStorageKey) !== generation) return false;
		const entries = readProfile().entries;
		return entries.size === snapshot.size && [...entries].every(([key, value]) => snapshot.get(key) === value);
	}

	return { load, save, replace, isCurrent };
}
