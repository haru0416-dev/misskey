/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, describe, expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import {
	applyStoryHandlers,
	createAppRuntime,
	resetIndexedDb,
	resetLocalStorage,
	resetPopups,
	startMockServiceWorker,
} from '@/stories/environment.js';
import { buildStoryComponent, createStoryContext } from '@/stories/render.js';
import PopupHost from '@/stories/PopupHost.vue';
import type { StoryObj } from '@/stories/types.js';

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

const worker = await startMockServiceWorker();
const runtime = await createAppRuntime();

afterAll(() => worker.stop());

/** 非同期の初期化が落ち着くまで待つ。 */
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		await nextTick();
		await new Promise((resolve) => setTimeout(resolve, 16));
	}
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

				await resetIndexedDb();
				await resetPopups();
				resetLocalStorage();
				applyStoryHandlers(worker, story.parameters?.msw);

				// Vue が処理したエラーもテスト失敗として扱う。
				const errors: unknown[] = [];
				const context = createStoryContext(story, container);
				const app = createApp(buildStoryComponent(story, context));
				app.config.errorHandler = (err) => errors.push(err);
				runtime.install(app);
				app.mount(container);

				// popup は本体では app shell が描画する。play は within(canvasElement) で探すので
				// canvasElement の内側に置く。story を root のまま保つため mount 後に足す。
				const popupRoot = document.createElement('div');
				container.appendChild(popupRoot);
				const popupApp = createApp(PopupHost);
				popupApp.config.errorHandler = (err) => errors.push(err);
				runtime.install(popupApp);
				popupApp.mount(popupRoot);

				try {
					// nextTick だけでは、モックした API の応答が解決した後に投げる例外を取り逃す。
					// マクロタスクを数回回して落ち着かせてから判定する。
					await settle();
					await story.play?.(context);
					await settle();
					expect(errors).toEqual([]);
				} finally {
					app.unmount();
					popupApp.unmount();
					container.remove();
					popupRoot.remove();
				}
			});
		}
	});
}
