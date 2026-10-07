/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setupWorker } from 'msw/browser';
import type { App } from 'vue';
import type { SetupWorker } from 'msw/browser';
import { apiFallbackHandler, commonHandlers, onUnhandledRequest } from './mocks.js';
import { meta, userDetailed } from './fakes.js';

const themeModules = import.meta.glob<Record<string, unknown>>('@/shared/themes/*.json5', {
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
 * story は「ログイン済みでデフォルト設定」の前提で書かれている。毎回同じ状態から始めるため、
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

/** 開いた接続を維持したまま全 store を空にし、story 間で IndexedDB の値を引き継がない。 */
export async function resetIndexedDb(): Promise<void> {
	if (globalThis.indexedDB?.databases == null) return;
	for (const entry of await indexedDB.databases()) {
		if (entry.name == null) continue;
		const opened = Promise.withResolvers<IDBDatabase>();
		const request = indexedDB.open(entry.name);
		request.onsuccess = () => opened.resolve(request.result);
		request.onerror = () => opened.reject(request.error);
		const db = await opened.promise;
		try {
			const stores = Array.from(db.objectStoreNames);
			if (stores.length === 0) continue;
			const completed = Promise.withResolvers<void>();
			const tx = db.transaction(stores, 'readwrite');
			tx.oncomplete = () => completed.resolve();
			tx.onabort = tx.onerror = () => completed.reject(tx.error);
			for (const name of stores) tx.objectStore(name).clear();
			await completed.promise;
		} finally {
			db.close();
		}
	}
}

let workerPromise: Promise<SetupWorker> | null = null;

const activeApiRequests = new Set<string>();
const idleWaiters = new Set<() => void>();
let apiRequestEpoch = 0;

export function getApiRequestEpoch(): number {
	return apiRequestEpoch;
}

export async function waitForApiRequests(): Promise<void> {
	if (activeApiRequests.size === 0) return;
	const idle = Promise.withResolvers<void>();
	idleWaiters.add(idle.resolve);
	await idle.promise;
}

/**
 * msw を起動する。二度目以降は同じ worker を返す。
 *
 * **テストファイルより先に呼ぶこと** (setupFile から)。本体には module scope で API を叩く
 * ページがあり (settings/profiles.vue の `await listCloudBackups()` など)、
 * worker が上がる前に import されるとモックを経由せずに 404 の空応答になり、
 * `res.json()` が未捕捉の SyntaxError になる。
 */
export function startMockServiceWorker(): Promise<SetupWorker> {
	workerPromise ??= (async () => {
		const worker = setupWorker(...commonHandlers, apiFallbackHandler);
		worker.events.on('request:start', ({ request, requestId }) => {
			if (!new URL(request.url).pathname.startsWith('/api/')) return;
			activeApiRequests.add(requestId);
			apiRequestEpoch++;
		});
		worker.events.on('request:end', ({ requestId }) => {
			if (!activeApiRequests.delete(requestId) || activeApiRequests.size > 0) return;
			for (const resolve of idleWaiters) resolve();
			idleWaiters.clear();
		});
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
	if (parameter == null) {
		return;
	}

	const handlers = Array.isArray(parameter)
		? parameter
		: Object.values((parameter as { handlers?: unknown }).handlers ?? {}).flat();

	if (handlers.length > 0) {
		worker.use(...(handlers as Parameters<SetupWorker['use']>));
	}
}

export type MisskeyOs = typeof import('@/os.js');

export type AppRuntime = {
	os: MisskeyOs;
	install: (app: App) => void;
	reset: () => Promise<void>;
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
	const [
		{ default: components },
		{ default: directives },
		{ default: widgets },
		{ themeManager },
		os,
		{ store },
		{ prefer },
	] = await Promise.all([
		import('@/components/index.js'),
		import('@/directives/index.js'),
		import('@/widgets/index.js'),
		import('@/theme.js'),
		import('@/os.js'),
		import('@/store.js'),
		import('@/preferences.js'),
	]);

	watchTheme(themeManager);

	return {
		os,
		reset: async () => {
			await Promise.all([store.$persistFlush(), prefer.$preferencesFlush()]);
			await resetIndexedDb();
			await resetPopups();
			resetLocalStorage();
			store.$reset();
			prefer.reloadProfile();
			await store.$persistFlush();
		},
		install: (app: App) => {
			components(app);
			directives(app);
			widgets(app);
		},
	};
}
