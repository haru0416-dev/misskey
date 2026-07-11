/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// FirefoxのプライベートモードなどではindexedDBが使用不可能なので、
// indexedDBが使えない環境ではlocalStorageを使う
import { get as iget, set as iset, del as idel, clear as iclear } from 'idb-keyval';
import { miLocalStorage } from '@/local-storage.js';

const PREFIX = 'idbfallback::';

let idbAvailable =
	typeof window !== 'undefined' ? !!(window.indexedDB && typeof window.indexedDB.open === 'function') : true;

// iframe.contentWindow.indexedDB.deleteDatabase() がchromeのバグで使用できないため、E2E ではindexedDBを無効化している。
// see https://github.com/misskey-dev/misskey/issues/13605#issuecomment-2053652123
if (window.localStorage.getItem('__MISSKEY_E2E_TEST__') === 'true') {
	idbAvailable = false;
	console.log('E2E test detected. It will use localStorage.');
}

if (idbAvailable) {
	await iset('idb-test', 'test').catch((err) => {
		console.error('idb error', err);
		console.error('indexedDB is unavailable. It will use localStorage.');
		idbAvailable = false;
	});
} else {
	console.error('indexedDB is unavailable. It will use localStorage.');
}

export async function get(key: string) {
	if (idbAvailable) return iget(key);
	return miLocalStorage.getItemAsJson(`${PREFIX}${key}`);
}

export async function set(key: string, val: unknown) {
	if (idbAvailable) return iset(key, val);
	return miLocalStorage.setItemAsJson(`${PREFIX}${key}`, val);
}

export async function del(key: string) {
	if (idbAvailable) return idel(key);
	return miLocalStorage.removeItem(`${PREFIX}${key}`);
}

export async function clear() {
	if (idbAvailable) return iclear();
}
