/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, describe, test } from 'vitest';
import { createApp } from 'vue';
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

const worker = await startMockServiceWorker();
const runtime = await createAppRuntime();

afterAll(() => worker.stop());

/**
 * play を持つ story だけを実際に mount して走らせる。play を持たない story の描画確認は
 * カタログ (`bun run --filter frontend catalog`) 側の役目。
 */
for (const [path, load] of Object.entries(modules)) {
	const title = path.replace(/^\.\.\/src\//, '').replace(/\.stories\.impl\.ts$/, '');
	const module = await load();

	const playable = Object.entries(module).filter(
		([, value]) => value != null && typeof (value as StoryObj).play === 'function',
	) as [string, StoryObj][];

	if (playable.length === 0) continue;

	describe(title, () => {
		for (const [name, story] of playable) {
			test(name, async () => {
				const container = document.createElement('div');
				document.body.appendChild(container);

				await resetIndexedDb();
				await resetPopups();
				resetLocalStorage();
				applyStoryHandlers(worker, story.parameters?.msw);

				const context = createStoryContext(story, container);
				const app = createApp(buildStoryComponent(story, context));
				runtime.install(app);
				app.mount(container);

				// popup は本体では app shell が描画する。play は within(canvasElement) で探すので
				// canvasElement の内側に置く。story を root のまま保つため mount 後に足す。
				const popupRoot = document.createElement('div');
				container.appendChild(popupRoot);
				const popupApp = createApp(PopupHost);
				runtime.install(popupApp);
				popupApp.mount(popupRoot);

				try {
					await story.play?.(context);
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
