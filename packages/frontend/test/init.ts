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

// ロケールは読み込み時の top-level await で取得される (src/shared/utility/locale.ts)。下の import より前に
// 応答を差し替えないと、localhost:3000 へ実際に取りに行き、そこで動いているサーバー次第で結果が変わる。
// 照合する URL は絶対 URL になるので、先頭には固定しない。
function mockLocaleFetch(): void {
	fetchMocker.mockIf(/\/assets\/locales\/[^/]+\.json$/, async () => {
		const { default: locales } = await import('i18n');
		return {
			status: 200,
			body: JSON.stringify(locales['en-US']),
		};
	});
}
mockLocaleFetch();

/**
 * テストが積んだ 1 回限りの応答と呼び出し履歴を捨てる。使われずに残った応答は、後に実行されたテストの取得に返ってしまう。
 * resetMocks だけではロケールの応答も消えるので張り直す。
 */
export function resetFetchMocks(): void {
	fetchMocker.resetMocks();
	mockLocaleFetch();
}

// WebSocket が未定義だと misskey-js の初期化に失敗する。
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

// テスト環境では localStorage が存在しない場合がある。
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

// instance は localStorage のキャッシュから作られる。空だと meta の全項目が undefined になり、
// 実運用では起きない参照でコンポーネントが落ちる。
const { meta } = await import('@/stories/fakes.js');
localStorage.setItem('instance', JSON.stringify(meta()));
localStorage.setItem('instanceCachedAt', '1');

// i18n の読み込み時に localStorage を参照するため、localStorage のモック設定後に実行する。
const { default: locales } = await import('i18n');

const { updateI18n } = await import('@/i18n.js');
const enUsLocale = locales['en-US'];
if (enUsLocale == null) {
	throw new Error('en-US locale is required for frontend tests');
}
updateI18n(enUsLocale);

export type TestPreferenceState = Record<string, unknown> & {
	animation?: boolean;
	emojiStyle?: string;
};

export type TestPreferenceReactive = Record<string, Ref<unknown>> & {
	animation?: Ref<boolean>;
	emojiStyle?: Ref<string>;
};

export const preferState: TestPreferenceState = {
	dataSaver: {
		media: false,
		avatar: false,
		urlPreview: false,
		code: false,
	},

	mutingEmojis: [],
};

export const preferReactive: TestPreferenceReactive = {};

for (const key in preferState) {
	if (preferState[key] !== undefined) {
		preferReactive[key] = ref(preferState[key]);
	}
}

const prefer = new Proxy(
	{
		commit(key: string, value: unknown) {
			preferState[key] = value;
			if (preferReactive[key] == null) {
				preferReactive[key] = ref(value);
			} else {
				preferReactive[key].value = value;
			}
		},
		model(key: string) {
			if (preferReactive[key] == null) {
				preferReactive[key] = ref(preferState[key]);
			}
			return preferReactive[key];
		},
	},
	{
		get(target, key, receiver) {
			if (typeof key === 'string' && preferReactive[key] != null) {
				return preferReactive[key].value;
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
			if (preferReactive[key] == null) {
				preferReactive[key] = ref(value);
			} else {
				preferReactive[key].value = value;
			}
			return true;
		},
	},
);

vi.mock('@/preferences.js', () => {
	return {
		prefer,
	};
});

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
