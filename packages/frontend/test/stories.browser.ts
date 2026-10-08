/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, describe, expect, test, vi } from 'vitest';
import { createApp, nextTick, watch } from 'vue';
import { userEvent as browserUserEvent } from 'vitest/browser';
import {
	applyStoryHandlers,
	createAppRuntime,
	startMockServiceWorker,
	getApiRequestEpoch,
	waitForApiRequests,
} from '@/stories/environment.js';
import { buildStoryComponent, createStoryContext } from '@/stories/render.js';
import PopupHost from '@/stories/PopupHost.vue';
import type { StoryObj } from '@/stories/types.js';
import { unexpectedApiRequests } from '@/stories/mocks.js';

const modules = import.meta.glob<Record<string, unknown>>('../src/**/*.stories.impl.ts');

// 見た目・文言だけの展示は登録しない。独立した初期化経路の smoke と操作シナリオは残す。
const catalogOnlyStories: Record<string, readonly string[]> = {
	'components/form/MkButton': ['Default', 'Primary', 'Gradate', 'Rounded', 'Danger', 'Small', 'Large'],
	'components/global/MkLoading': ['Inline', 'Colored', 'Mini', 'Em', 'Static'],
	'components/global/MkEllipsis': ['Static'],
	'components/global/MkAvatar': ['ProfilePageCat'],
	'components/global/MkCondensedLine': ['ContainerIs100px'],
	'components/global/MkMfm': ['Nowrap'],
	'components/global/MkUserName': ['Wrap'],
	'components/global/MkAd': ['Horizontal', 'HorizontalBig'],
	'components/global/MkAcct': ['Long', 'VeryLong'],
	'components/overlay/MkDialog': ['Success', 'Error', 'Warning', 'Info', 'Question', 'Waiting'],
	'features/role/components/MkRoleSelectDialog': ['InfoMessage', 'Title'],
	'components/global/MkCustomEmoji': ['Normal'],
	'features/drive/components/MkDrive': ['TypeFilter'],
	'components/global/MkTime': [
		'AbsoluteFuture',
		'DetailFuture',
		'AbsoluteOneHourAgo',
		'DetailOneHourAgo',
		'AbsoluteOneDayAgo',
		'DetailOneDayAgo',
		'AbsoluteOneWeekAgo',
		'DetailOneWeekAgo',
		'AbsoluteOneMonthAgo',
		'DetailOneMonthAgo',
		'AbsoluteOneYearAgo',
		'DetailOneYearAgo',
	],
};

/**
 * 実際のマウスカーソルを置いておく、最前面の小さな要素。
 *
 * play の操作 (@testing-library/user-event) は合成イベントで実カーソルを動かさない。実カーソルが story の上に
 * 止まっていると、描画が変わったときに Chromium が本物の pointerenter を送り、hover で表示が変わる部品の
 * 初期状態が実行順で変わる。
 */
const cursorParking = document.createElement('div');
cursorParking.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 4px; height: 4px; z-index: 2147483647;';
document.body.appendChild(cursorParking);
await browserUserEvent.hover(cursorParking);

const worker = await startMockServiceWorker();
const runtime = await createAppRuntime();
// 送信を始めた API 要求の数。msw の request:start はページから Service Worker へ届いてから発火するので、
// それだけを見ると送信直後の要求を取りこぼす。取りこぼした要求は story を外した後に msw へ届き、
// 次の story のハンドラで処理されて次の story の失敗になる。
const { pendingApiRequestsCount } = await import('@/utility/misskey-api.js');

async function waitForPageApiRequests(): Promise<void> {
	if (pendingApiRequestsCount.value === 0) return;
	const idle = Promise.withResolvers<void>();
	const stop = watch(pendingApiRequestsCount, (count) => {
		if (count === 0) idle.resolve();
	});
	try {
		await idle.promise;
	} finally {
		stop();
	}
}

afterAll(() => worker.stop());

/** 開始済みの API (ページ側と msw 側の両方) と Vue 更新を待ち、未開始の遅延処理は各 play の結果条件で確認する。 */
async function settle(): Promise<void> {
	let epoch: number;
	do {
		epoch = getApiRequestEpoch();
		await waitForPageApiRequests();
		await waitForApiRequests();
		await nextTick();
		const painted = Promise.withResolvers<void>();
		requestAnimationFrame(() => painted.resolve());
		await painted.promise;
	} while (epoch !== getApiRequestEpoch() || pendingApiRequestsCount.value > 0);
}

function isStory(value: unknown): value is StoryObj {
	if (value == null || typeof value !== 'object') {
		return false;
	}
	const story = value as StoryObj;
	return story.render != null || story.args != null;
}

/**
 * 展示専用として列挙したもの以外を mount し、play を持つものはそれも走らせる。
 *
 * play が無い story の初期化 smoke も残し、Vue の errorHandler へ届く例外を検出する。
 */
for (const [path, load] of Object.entries(modules)) {
	const title = path.replace(/^\.\.\/src\//, '').replace(/\.stories\.impl\.ts$/, '');
	const module = await load();
	const stories = Object.entries(module).filter(
		([name, value]) => isStory(value) && !catalogOnlyStories[title]?.includes(name),
	) as [string, StoryObj][];

	if (stories.length === 0) {
		continue;
	}

	describe(title, () => {
		for (const [name, story] of stories) {
			test(name, async () => {
				const container = document.createElement('div');
				document.body.appendChild(container);

				await runtime.reset();
				unexpectedApiRequests.length = 0;
				applyStoryHandlers(worker, story.parameters?.msw);

				// Vue が処理したエラー、Vue の警告 (prop の型違い・inject 先の欠落など)、console.error も
				// テスト失敗として扱う。警告は開発ビルドでしか出ず、本番では無言で誤った値のまま動く。
				const errors: unknown[] = [];
				const warnings: string[] = [];
				const consoleError = vi.spyOn(console, 'error');
				const warnHandler = (message: string, _instance: unknown, trace: string): void => {
					warnings.push(`${message}${trace}`);
				};
				const context = createStoryContext(story, container);
				const ready = Promise.withResolvers<void>();
				const app = createApp(buildStoryComponent(story, context, () => ready.resolve()));
				app.config.errorHandler = (err) => errors.push(err);
				app.config.warnHandler = warnHandler;
				runtime.install(app);
				app.mount(container);

				// popup は本体では app shell が描画する。play は within(canvasElement) で探すので
				// canvasElement の内側に置く。story を root のまま保つため mount 後に足す。
				const popupRoot = document.createElement('div');
				container.appendChild(popupRoot);
				const popupApp = createApp(PopupHost);
				popupApp.config.errorHandler = (err) => errors.push(err);
				popupApp.config.warnHandler = warnHandler;
				runtime.install(popupApp);
				popupApp.mount(popupRoot);

				try {
					// 遅延ロードした子画面が API を開始する前に、初期化完了と判定しない。
					await ready.promise;
					await settle();
					await story.play?.(context);
					await settle();
					expect(errors).toEqual([]);
					expect(warnings).toEqual([]);
					expect(consoleError.mock.calls.map((args) => args.map(String).join(' '))).toEqual([]);
					expect(unexpectedApiRequests).toEqual([]);
				} finally {
					app.unmount();
					popupApp.unmount();
					container.remove();
					popupRoot.remove();
					consoleError.mockRestore();
				}
			});
		}
	});
}
