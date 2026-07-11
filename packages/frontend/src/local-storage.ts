/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type Keys =
	| 'v'
	| 'lastVersion'
	| 'instance'
	| 'instanceCachedAt'
	| 'account'
	| 'latestDonationInfoShownAt'
	| 'neverShowDonationInfo'
	| 'neverShowLocalOnlyInfo'
	| 'modifiedVersionMustProminentlyOfferInAgplV3Section13Read'
	| 'lastUsed'
	| 'lang'
	| 'drafts'
	| 'hashtags'
	| 'colorScheme'
	| 'useSystemFont'
	| 'fontSize'
	| 'ui'
	| 'ui_temp'
	| 'bootloaderLocales'
	| 'theme'
	| 'themeId'
	| 'themeCachedVersion'
	| 'customCss'
	| 'chatMessageDrafts'
	| 'scratchpad'
	| 'debug'
	| 'preferences'
	| 'latestPreferencesUpdate'
	| 'hidePreferencesRestoreSuggestion'
	| 'isSafeMode'
	| `miux:${string}`
	| `ui:folder:${string}`
	| `aiscript:${string}`
	| `channelLastReadedAt:${string}`
	| `idbfallback::${string}`;

type JsonValidator<T> = (value: unknown) => value is T;
type ReadableStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function getStorageItemAsJson(storage: ReadableStorage, key: string): unknown | undefined;
export function getStorageItemAsJson<T>(storage: ReadableStorage, key: string, validate: JsonValidator<T>): T | undefined;
export function getStorageItemAsJson<T>(storage: ReadableStorage, key: string, validate?: JsonValidator<T>): T | unknown | undefined {
	const item = storage.getItem(key);
	if (item === null) return undefined;

	try {
		const parsed: unknown = JSON.parse(item);
		if (validate != null && !validate(parsed)) {
			storage.removeItem(key);
			return undefined;
		}
		return parsed;
	} catch {
		storage.removeItem(key);
		return undefined;
	}
}

function getItemAsJson(key: Keys): unknown | undefined;
function getItemAsJson<T>(key: Keys, validate: JsonValidator<T>): T | undefined;
function getItemAsJson<T>(key: Keys, validate?: JsonValidator<T>): T | unknown | undefined {
	return validate == null
		? getStorageItemAsJson(window.localStorage, key)
		: getStorageItemAsJson(window.localStorage, key, validate);
}

function setItemAsJson(key: Keys, value: unknown): void {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		miLocalStorage.removeItem(key);
		return;
	}
	miLocalStorage.setItem(key, serialized);
}

// セッション毎に廃棄されるLocalStorage代替（セーフモードなどで使用できそう）
//const safeSessionStorage = new Map<Keys, string>();

export const miLocalStorage = {
	getItem: (key: Keys): string | null => {
		return window.localStorage.getItem(key);
	},
	setItem: (key: Keys, value: string): void => {
		window.localStorage.setItem(key, value);
	},
	removeItem: (key: Keys): void => {
		window.localStorage.removeItem(key);
	},
	getItemAsJson,
	setItemAsJson,
};
