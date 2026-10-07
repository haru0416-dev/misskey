/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 初回起動時に保存先を選び、以後は同じ origin の全タブで保存先を共有する。
import { get as iget, set as iset, update as iupdate, clear as iclear } from 'idb-keyval';
import { miLocalStorage } from '@/local-storage.js';

const PREFIX = 'idbfallback::';

type PersistenceBackend = 'indexedDB' | 'localStorage';
const BACKEND_KEY = 'persistenceBackend';
const hasStartupLock = typeof navigator !== 'undefined' && navigator.locks != null;

async function selectBackend(): Promise<PersistenceBackend> {
	const selected = window.localStorage.getItem(BACKEND_KEY);
	if (selected != null) {
		if (selected !== 'indexedDB' && selected !== 'localStorage') throw new Error('Invalid persistence backend');
		// 保存先の復旧で別の保存先へ切り替えない。選択済み IndexedDB の障害はそのまま呼出元へ返す。
		if (selected === 'indexedDB') await iset('idb-test', 'test');
		return selected;
	}

	let backend: PersistenceBackend = 'localStorage';
	const canProbe =
		hasStartupLock &&
		window.indexedDB != null &&
		typeof window.indexedDB.open === 'function' &&
		window.localStorage.getItem('__MISSKEY_E2E_TEST__') !== 'true';
	if (canProbe) {
		try {
			await iset('idb-test', 'test');
			backend = 'indexedDB';
		} catch (error) {
			console.error('IndexedDB is unavailable; selecting localStorage persistence', error);
		}
	}
	// Web Locks 非対応時の初回選択は全タブで localStorage に固定する。更新自体の競合保護は best-effort。
	window.localStorage.setItem(BACKEND_KEY, backend);
	return backend;
}

const backend = await (hasStartupLock
	? navigator.locks.request('misskey-persistence-backend', selectBackend)
	: selectBackend());

export async function get(key: string) {
	if (backend === 'indexedDB') {
		return iget(key);
	}
	return miLocalStorage.getItemAsJson(`${PREFIX}${key}`);
}

export async function set(key: string, val: unknown) {
	if (backend === 'indexedDB') {
		return iset(key, val);
	}
	return miLocalStorage.setItemAsJson(`${PREFIX}${key}`, val);
}

export async function update(key: string, updater: (value: unknown) => unknown) {
	if (backend === 'indexedDB') {
		return iupdate(key, updater);
	}
	const storageKey = `${PREFIX}${key}` as `idbfallback::${string}`;
	const write = () => {
		const value = updater(miLocalStorage.getItemAsJson(storageKey));
		miLocalStorage.setItemAsJson(storageKey, value);
	};
	// Web Locks対応環境ではtab間のread-modify-writeを直列化する。非対応環境ではbest-effortとなり、並行更新が上書きし得る。
	if (typeof navigator !== 'undefined' && navigator.locks != null) {
		return navigator.locks.request(storageKey, write);
	}
	write();
}

export async function clear() {
	if (backend === 'indexedDB') {
		return iclear();
	}
}
