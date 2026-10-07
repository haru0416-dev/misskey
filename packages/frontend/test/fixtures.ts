/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import type { Ref } from 'vue';
import { ref, shallowReactive } from 'vue';
import type { Locale } from 'i18n';

const fetchMocker = createFetchMock(vi);
let localeBody: string;

export function initializeFetchMocks(locale: Locale): void {
	localeBody = JSON.stringify(locale);
	fetchMocker.enableMocks();
	resetFetchMocks();
}

/**
 * 未使用の一回限りの応答を次のテストへ渡さず、ロケール取得の応答は維持する。
 */
export function resetFetchMocks(): void {
	fetchMocker.resetMocks();
	fetchMocker.mockIf(/\/assets\/locales\/[^/]+\.json$/, async () => ({
		status: 200,
		body: localeBody,
	}));
}

export type TestPreferenceState = Record<string, unknown> & {
	animation?: boolean;
	emojiStyle?: string;
};

export type TestPreferenceReactive = Record<string, Ref<unknown>> & {
	animation?: Ref<boolean>;
	emojiStyle?: Ref<string>;
};

export const preferReactive = shallowReactive<TestPreferenceReactive>({
	dataSaver: ref({ media: false, avatar: false, urlPreview: false, code: false }),
	mutingEmojis: ref([]),
});

export const preferState = new Proxy({} as TestPreferenceState, {
	get(_target, key) {
		return typeof key === 'string' ? preferReactive[key]?.value : undefined;
	},
	set(_target, key, value) {
		if (typeof key !== 'string') return false;
		if (preferReactive[key] == null) preferReactive[key] = ref(value);
		else preferReactive[key].value = value;
		return true;
	},
	ownKeys: () => Reflect.ownKeys(preferReactive),
	getOwnPropertyDescriptor: (_target, key) =>
		typeof key === 'string' && Object.hasOwn(preferReactive, key)
			? { configurable: true, enumerable: true }
			: undefined,
});

export const prefer = new Proxy(
	{
		commit(key: string, value: unknown) {
			preferState[key] = value;
		},
		model(key: string) {
			if (preferReactive[key] == null) {
				preferReactive[key] = ref(undefined);
			}
			return preferReactive[key];
		},
	},
	{
		get(target, key, receiver) {
			if (typeof key === 'string' && preferReactive[key] != null) {
				return preferState[key];
			}
			if (typeof key === 'string' && Object.hasOwn(preferState, key)) {
				return preferState[key];
			}
			return Reflect.get(target, key, receiver);
		},
		set(_target, key, value) {
			if (typeof key !== 'string') {
				return false;
			}
			preferState[key] = value;
			return true;
		},
	},
);
