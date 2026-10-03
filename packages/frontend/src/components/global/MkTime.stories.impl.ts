/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import MkTime from './MkTime.vue';
import { i18n } from '@/i18n.js';
import { dateTimeFormat } from '@/shared/utility/intl-const.js';
const now = new Date('2023-04-01T00:00:00.000Z');
const future = new Date('2024-04-01T00:00:00.000Z');
const oneHourAgo = new Date(now.getTime() - 3600000);
const oneDayAgo = new Date(now.getTime() - 86400000);
const oneWeekAgo = new Date(now.getTime() - 604800000);
const oneMonthAgo = new Date(now.getTime() - 2592000000);
const oneYearAgo = new Date(now.getTime() - 31536000000);
export const Empty = {
	render(args) {
		return {
			components: {
				MkTime,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
			},
			template: '<MkTime v-bind="props" />',
		};
	},
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.ts._ago.invalid);
	},
	args: {},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkTime>;
const visual = { render: Empty.render, parameters: Empty.parameters };
export const RelativeFuture = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._timeIn.years({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: future,
		origin: now,
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteFuture = {
	...visual,
	args: {
		...Empty.args,
		time: future,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailFuture = {
	...visual,
	args: {
		...Empty.args,
		time: future,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeNow = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.ts._ago.justNow);
	},
	args: {
		...Empty.args,
		time: now,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteNow = {
	...Empty,
	async play({ canvasElement, args }) {
		await expect(canvasElement).toHaveTextContent(
			dateTimeFormat.format(typeof args.time === 'string' ? new Date(args.time) : (args.time ?? undefined)),
		);
	},
	args: {
		...Empty.args,
		time: now,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailNow = {
	...Empty,
	async play(context) {
		await AbsoluteNow.play(context);
		await expect(context.canvasElement).toHaveTextContent(' (');
		await RelativeNow.play(context);
		await expect(context.canvasElement).toHaveTextContent(')');
	},
	args: {
		...Empty.args,
		time: now,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeOneHourAgo = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._ago.hoursAgo({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: oneHourAgo,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteOneHourAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneHourAgo,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailOneHourAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneHourAgo,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeOneDayAgo = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._ago.daysAgo({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: oneDayAgo,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteOneDayAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneDayAgo,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailOneDayAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneDayAgo,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeOneWeekAgo = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._ago.weeksAgo({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: oneWeekAgo,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteOneWeekAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneWeekAgo,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailOneWeekAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneWeekAgo,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeOneMonthAgo = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._ago.monthsAgo({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: oneMonthAgo,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteOneMonthAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneMonthAgo,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailOneMonthAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneMonthAgo,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
export const RelativeOneYearAgo = {
	...Empty,
	async play({ canvasElement }) {
		await expect(canvasElement).toHaveTextContent(i18n.tsx._ago.yearsAgo({ n: 1 }));
	},
	args: {
		...Empty.args,
		time: oneYearAgo,
		origin: now,
		mode: 'relative',
	},
} satisfies StoryObj<typeof MkTime>;
export const AbsoluteOneYearAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneYearAgo,
		origin: now,
		mode: 'absolute',
	},
} satisfies StoryObj<typeof MkTime>;
export const DetailOneYearAgo = {
	...visual,
	args: {
		...Empty.args,
		time: oneYearAgo,
		origin: now,
		mode: 'detail',
	},
} satisfies StoryObj<typeof MkTime>;
