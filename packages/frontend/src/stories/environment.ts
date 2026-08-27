/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setupWorker } from 'msw/browser';
import type { App } from 'vue';
import type { SetupWorker } from 'msw/browser';
import { apiFallbackHandler, commonHandlers, onUnhandledRequest } from './mocks.js';
import { meta, userDetailed } from './fakes.js';

const themeModules = import.meta.glob<Record<string, unknown>>('@shared/themes/*.json5', {
	eager: true,
	import: 'default',
});

// glob の key は解決後のパスなので、ファイル名だけを見て引く。
const themes = new Map(
	Object.entries(themeModules).map(([path, theme]) => [path.replace(/^.*\//, '').replace(/\.json5$/, ''), theme]),
);

function themeOf(id: string): Record<string, unknown> | undefined {
	return themes.get(id);
}

/**
 * story は「ログイン済みで既定設定」の前提で書かれている。毎回同じ状態から始めるため、
 * story を切り替えるたびに localStorage を作り直す。
 */
export function resetLocalStorage(): void {
	localStorage.clear();
	// token が無いと isAccountWithToken を通らず $i が null になり、ログイン前提の
	// コンポーネントが "signin required" で落ちる。
	// userDetailed() は他人のユーザーなので、`MeDetailed` にしかない項目はここで補う。
	localStorage.setItem(
		'account',
		JSON.stringify({ ...userDetailed(), token: 'story-token', policies: {}, mutedWords: [], hardMutedWords: [] }),
	);
	// instance は localStorage のキャッシュから作られる。空だと meta の全項目が undefined になり、
	// 実運用では起きない参照で story が落ちる。
	localStorage.setItem('instance', JSON.stringify(meta()));
	localStorage.setItem('instanceCachedAt', Date.now().toString());
}

/**
 * 開いたままの popup を閉じる。os.popups は全体で 1 つなので、閉じ損ねた popup が
 * 次の story の canvas に混ざり、getByRole が複数一致して失敗する。
 */
export async function resetPopups(): Promise<void> {
	const { popups } = await import('@/os.js');
	popups.value = [];
}

/** story 間で IndexedDB の残留が漏れないようにする。 */
export async function resetIndexedDb(): Promise<void> {
	if (globalThis.indexedDB?.databases == null) return;
	try {
		for (const db of await indexedDB.databases()) {
			if (db.name != null) indexedDB.deleteDatabase(db.name);
		}
	} catch {
		// プライベートモード等で列挙できない環境は諦める。
	}
}

let workerPromise: Promise<SetupWorker> | null = null;

/**
 * msw を起動する。二度目以降は同じ worker を返す。
 *
 * **テストファイルより先に呼ぶこと** (setupFile から)。本体には module scope で API を叩く
 * ページがあり (settings/profiles.vue の `await listCloudBackups()` など)、
 * worker が上がる前に import されるとモックを素通りして 404 の空応答になり、
 * `res.json()` が未捕捉の SyntaxError になる。
 */
export function startMockServiceWorker(): Promise<SetupWorker> {
	workerPromise ??= (async () => {
		const worker = setupWorker(...commonHandlers, apiFallbackHandler);
		await worker.start({ quiet: true, onUnhandledRequest });
		return worker;
	})();

	return workerPromise;
}

/**
 * `parameters.msw` は配列でも `{ handlers }` でも書かれている。共通ハンドラの上に重ねる。
 */
export function applyStoryHandlers(worker: SetupWorker, parameter: unknown): void {
	// fallback は必ず最後。story の独自ハンドラは use() で前に積まれるので先に一致する。
	worker.resetHandlers(...commonHandlers, apiFallbackHandler);
	if (parameter == null) return;

	const handlers = Array.isArray(parameter)
		? parameter
		: Object.values((parameter as { handlers?: unknown }).handlers ?? {}).flat();

	if (handlers.length > 0) worker.use(...(handlers as Parameters<SetupWorker['use']>));
}

export type MisskeyOs = typeof import('@/os.js');

export type AppRuntime = {
	os: MisskeyOs;
	install: (app: App) => void;
};

let observer: MutationObserver | null = null;

/**
 * `data-misskey-theme` の変化に追従してテーマを差し替える。
 */
function watchTheme(themeManager: (typeof import('@/theme.js'))['themeManager']): void {
	const update = (): void => {
		const id = document.documentElement.dataset['misskeyTheme'];
		themeManager.updateTheme((themeOf(id ?? '') ?? themeOf('l-light')) as never);
	};

	update();
	observer?.disconnect();
	observer = new MutationObserver(update);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-misskey-theme'] });
}

export function themeIds(): string[] {
	return [...themes.keys()].filter((id) => !id.startsWith('_')).sort();
}

/**
 * 本体と同じ component / directive / widget を登録する。story は素の Vue アプリではなく
 * これらが揃っている前提で書かれている。
 */
export async function createAppRuntime(): Promise<AppRuntime> {
	const [{ default: components }, { default: directives }, { default: widgets }, { themeManager }, os] =
		await Promise.all([
			import('@/components/index.js'),
			import('@/directives/index.js'),
			import('@/widgets/index.js'),
			import('@/theme.js'),
			import('@/os.js'),
		]);

	watchTheme(themeManager);

	return {
		os,
		install: (app: App) => {
			components(app);
			directives(app);
			widgets(app);
		},
	};
}
