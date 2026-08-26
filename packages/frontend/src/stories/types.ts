/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Component } from 'vue';
import type { ComponentProps } from 'vue-component-type-helpers';

/** story を包む要素の置き方。`<story/>` を持つ decorator とは別に、外枠だけを指定する。 */
export type StoryLayout = 'centered' | 'fullscreen' | 'padded';

export type StoryParameters = {
	layout?: StoryLayout;
	/** msw のハンドラ。配列でも `{ handlers }` でも受ける。 */
	msw?: unknown;
	[key: string]: unknown;
};

export type StoryContext<Args = Record<string, unknown>> = {
	args: Args;
	canvasElement: HTMLElement;
	parameters: StoryParameters;
};

/**
 * story を包む。返り値のテンプレート中の `<story/>` が story 本体に置き換わる。
 */
export type Decorator<Args = Record<string, unknown>> = (
	story: () => Component,
	context: StoryContext<Args>,
) => Component;

export type StoryObj<C = unknown, Args = ComponentProps<C> & Record<string, unknown>> = {
	name?: string;
	/** 一部だけ指定して残りは既定値、という書き方をするので Partial。 */
	args?: Partial<Args>;
	/** render が受け取る時点では args は解決済みとして扱う。 */
	render?: (args: Args, context: StoryContext<Args>) => Component;
	argTypes?: Record<string, unknown>;
	decorators?: Decorator<Args>[];
	parameters?: StoryParameters;
	play?: (context: StoryContext<Args>) => void | Promise<void>;
};

export type Meta<C = unknown> = {
	title?: string;
	component?: C;
	args?: Partial<ComponentProps<C>> & Record<string, unknown>;
	argTypes?: Record<string, unknown>;
	parameters?: StoryParameters;
};
