/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { h, defineComponent } from 'vue';
import type { Component } from 'vue';
import type { StoryContext, StoryObj } from './types.js';

/**
 * decorator が返すテンプレート中の `<story/>` を story 本体へ差し替える。
 * decorator は配列の先頭ほど内側に置かれる (Storybook と同じ順)。
 */
function decorate(inner: Component, story: StoryObj, context: StoryContext): Component {
	let current = inner;

	for (const decorator of story.decorators ?? []) {
		const wrapper = decorator(() => current, context) as Component & {
			components?: Record<string, Component>;
		};
		const wrapped = current;
		current = {
			...wrapper,
			components: { ...(wrapper.components ?? {}), story: wrapped },
		};
	}

	return current;
}

/** story の render / decorator / play が共通で受け取る文脈を組み立てる。 */
export function createStoryContext(story: StoryObj, canvasElement: HTMLElement): StoryContext {
	return {
		args: (story.args ?? {}) as Record<string, unknown>,
		canvasElement,
		parameters: story.parameters ?? {},
	};
}

/**
 * story を描画できる component に変換する。
 *
 * `render` を持たない story は args を当てる先が無いので空要素になる。呼び出し側 (registry) が
 * そもそも一覧へ載せない前提。
 */
export function buildStoryComponent(story: StoryObj, context: StoryContext): Component {
	const inner = story.render?.(context.args, context) ?? defineComponent({ render: () => h('div') });

	return decorate(inner as Component, story, context);
}
