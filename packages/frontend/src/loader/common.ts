/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// ブートローダーの共通処理。ローダーは Vite のバンドルより前に、HTML に埋め込まれた普通のスクリプトとして動く。
// builder/vite-plugin-boot-loader.ts が入口ごとに 1 つのスクリプトへまとめるので、ここから import できるのは
// ローダーに入れてよい小さなモジュールだけ (Vue やアプリの状態を持つモジュールは import しない)。

import { BOOTLOADER_LOCALES_KEY } from '@/shared/utility/store-boot-errors.js';
import type { BootLoaderLocaleBody } from '@/shared/utility/store-boot-errors.js';

// バックエンドが <script> で書き出す定数 (packages/backend/src/server/web/views/_head.tsx の BootConstantsScript)。
// 名前を変えるときは両方を揃える。
declare const CLIENT_ENTRY: string | null;
declare const CLIENT_PRELOADS: string[];
declare const LANGS: string[];

/** 起動を止めて出すエラー画面。code は利用者がサーバー管理者へ伝えるための識別子。 */
export type RenderError = (code: string, details?: unknown) => Promise<void>;

/** 未処理のエラーでエラー画面を出す。localStorage の forceError があれば、起動せずにエラー画面を出す。 */
export function installErrorHandlers(renderError: RenderError): boolean {
	window.onerror = (e) => {
		console.error(e);
		void renderError('SOMETHING_HAPPENED', e);
	};
	window.onunhandledrejection = (e) => {
		console.error(e);
		void renderError('SOMETHING_HAPPENED_IN_PROMISE', e.reason ?? e);
	};

	if (localStorage.getItem('forceError') != null) {
		void renderError('FORCED_ERROR', 'This error is forced by having forceError in local storage.');
		return false;
	}
	return true;
}

/** 表示言語。保存済みの設定、ブラウザの言語、同じ言語の別地域、en-US の順に選ぶ。 */
export function detectLang(): string {
	const saved = localStorage.getItem('lang');
	// https://github.com/misskey-dev/misskey/issues/10202 (文字列の 'null' が保存されていることがある)
	if (saved != null && saved !== 'null' && LANGS.includes(saved)) {
		return saved;
	}
	if (LANGS.includes(navigator.language)) {
		return navigator.language;
	}
	return LANGS.find((x) => x.split('-')[0] === navigator.language) ?? 'en-US';
}

/**
 * アプリの本体を読み込む。ロケールはビルド時に言語ごとのファイルへ埋め込まれているため、言語が決まってから読む。
 * 開発時はマニフェストが無く (CLIENT_ENTRY が null)、Vite の開発サーバーから入口のソースを読む。
 */
export function startApp(options: { base: string; devEntry: string; lang: string; renderError: RenderError }): void {
	const { base, devEntry, lang, renderError } = options;
	const localized = (file: string) => `${base}${file.replace('scripts', lang)}`;

	for (const file of [CLIENT_ENTRY, ...CLIENT_PRELOADS]) {
		if (file == null) {
			continue;
		}
		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = localized(file);
		document.head.appendChild(link);
	}

	const importAppScript = () => {
		import(CLIENT_ENTRY == null ? devEntry : localized(CLIENT_ENTRY)).catch((e: unknown) => {
			console.error(e);
			void renderError('APP_IMPORT', e);
		});
	};

	// DOMContentLoaded が発火済みなら、イベント待ちで起動を止めない。
	if (document.readyState !== 'loading') {
		importAppScript();
	} else {
		window.addEventListener('DOMContentLoaded', importAppScript);
	}
}

/** エラー画面を出せるよう、body ができるまで待つ。 */
export async function whenBodyReady(): Promise<void> {
	if (document.readyState === 'loading') {
		await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve));
	}
}

/** 前回の起動時に保存した、利用者の言語のエラー文言。無ければ空 (呼び出し側で英語に戻す)。 */
export function readBootErrorMessages(): Partial<BootLoaderLocaleBody> {
	try {
		const stored = localStorage.getItem(BOOTLOADER_LOCALES_KEY);
		return stored == null ? {} : (JSON.parse(stored) as Partial<BootLoaderLocaleBody>);
	} catch {
		return {};
	}
}

export function addStyle(styleText: string): void {
	const css = document.createElement('style');
	css.appendChild(document.createTextNode(styleText));
	document.head.appendChild(css);
}

/** 文言を innerHTML の中に入れるためのエスケープ。 */
export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
