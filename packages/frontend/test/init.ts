/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { commands } from 'vitest/browser';
import { initializeFetchMocks, prefer } from './fixtures.js';
import type { Locale } from 'i18n';
import { meta } from '@/stories/fakes.js';

declare module 'vitest/browser' {
	interface BrowserCommands {
		isolateNetwork: () => Promise<void>;
	}
}

await commands.isolateNetwork();

// 同じ origin のブラウザーコンテキストを再利用しても、前のファイルの保存状態を引き継がない。
// ネイティブの Storage を使い、window.localStorage と globalThis.localStorage を一致させる。
localStorage.clear();
sessionStorage.clear();
localStorage.setItem('lang', 'en-US');

const localeResponse = await fetch('/assets/locales/en-US.test.json');
if (!localeResponse.ok) throw new Error(`Failed to load test locale: ${localeResponse.status}`);
const enUsLocale: Locale = await localeResponse.json();

initializeFetchMocks(enUsLocale);

// コンポーネントの useStream() がバックエンドへの接続を開始しないよう、通信だけを差し替える。
vi.stubGlobal(
	'WebSocket',
	class WebSocket extends EventTarget {
		static CLOSING = 2;
		close() {}
	},
);

// instance は localStorage のキャッシュから作られる。空だと meta の全項目が undefined になり、
// 実運用では起きない参照でコンポーネントが落ちる。
localStorage.setItem('instance', JSON.stringify(meta()));
localStorage.setItem('instanceCachedAt', '1');

// ロケールの取得モックと instance キャッシュを設定してから、本体の i18n を読み込む。

const { updateI18n } = await import('@/i18n.js');
updateI18n(enUsLocale);

vi.mock('@/preferences.js', () => {
	return {
		prefer,
	};
});
