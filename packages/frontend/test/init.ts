/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import type { Ref } from 'vue';
import { ref } from 'vue';

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

// XXX: misskey-js panics if WebSocket is not defined
vi.stubGlobal(
	'WebSocket',
	class WebSocket extends EventTarget {
		static CLOSING = 2;
	},
);

vi.stubGlobal(
	'IntersectionObserver',
	class IntersectionObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
		takeRecords(): IntersectionObserverEntry[] {
			return [];
		}
	},
);

// XXX: localStorageがない場合がある
const localStorageMock = (() => {
	const store = new Map<string, string>();
	return {
		getItem(key: string) {
			return store.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			store.set(key, value);
		},
		removeItem(key: string) {
			store.delete(key);
		},
		clear() {
			store.clear();
		},
	};
})();
vi.stubGlobal('localStorage', localStorageMock);

// 中でlocalStorageを使うので上と順番を変えてはいけない
const { default: locales } = await import('i18n');

fetchMocker.mockIf(/^\/assets\/locales\/.*\.json$/, async () => {
	return {
		status: 200,
		body: JSON.stringify(locales['en-US']),
	};
});

const { updateI18n } = await import('@/i18n.js');
const enUsLocale = locales['en-US'];
if (enUsLocale == null) throw new Error('en-US locale is required for frontend tests');
updateI18n(enUsLocale);

export const preferState: Record<string, unknown> = {
	// なんかtestがうまいこと動かないのでここに書く
	dataSaver: {
		media: false,
		avatar: false,
		urlPreview: false,
		code: false,
	},

	mutingEmojis: [],
};

export let preferReactive: Record<string, Ref<unknown>> = {};

for (const key in preferState) {
	if (preferState[key] !== undefined) {
		preferReactive[key] = ref(preferState[key]);
	}
}

const prefer = new Proxy(
	{
		commit(key: string, value: unknown) {
			preferState[key] = value;
			if (preferReactive[key] == null) preferReactive[key] = ref(value);
			else preferReactive[key].value = value;
		},
		model(key: string) {
			if (preferReactive[key] == null) preferReactive[key] = ref(preferState[key]);
			return preferReactive[key];
		},
	},
	{
		get(target, key, receiver) {
			if (typeof key === 'string' && preferReactive[key] != null) return preferReactive[key].value;
			if (typeof key === 'string' && Object.hasOwn(preferState, key)) return preferState[key];
			return Reflect.get(target, key, receiver);
		},
		set(_target, key, value) {
			if (typeof key !== 'string') return false;
			preferState[key] = value;
			if (preferReactive[key] == null) preferReactive[key] = ref(value);
			else preferReactive[key].value = value;
			return true;
		},
	},
);

vi.mock('@/preferences.js', () => {
	return {
		prefer,
	};
});

// Add mocks for Web Audio API
const AudioNodeMock = vi.fn(() => ({
	connect: vi.fn(() => ({ connect: vi.fn() })),
	start: vi.fn(),
}));

const GainNodeMock = vi.fn(() => ({
	gain: vi.fn(),
}));

const AudioContextMock = vi.fn(() => ({
	createBufferSource: vi.fn(() => new AudioNodeMock()),
	createGain: vi.fn(() => new GainNodeMock()),
	decodeAudioData: vi.fn(),
}));

vi.stubGlobal('AudioContext', AudioContextMock);
