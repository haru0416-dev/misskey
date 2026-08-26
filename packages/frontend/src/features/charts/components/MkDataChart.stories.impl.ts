/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, waitFor, within } from '@/stories/test.js';
import type { StoryObj } from '@/stories/types.js';
import MkDataChart from './MkDataChart.vue';

const hour = 3600000;
// 実時刻を基準にすると見るたび軸が動くので、固定の起点から刻む。
const origin = new Date('2026-08-01T00:00:00Z').getTime();

function series(name: string, type: 'area' | 'bar' | 'line', values: number[]) {
	return {
		name,
		type,
		data: values.map((y, i) => ({ x: origin + i * hour, y })),
	};
}

const Base = {
	render: (args) => ({
		components: { MkDataChart },
		setup: () => ({ args }),
		// echarts は親のサイズを見て描画するので、高さのある枠に入れる。
		template: '<div style="width: 640px; height: 320px;"><MkDataChart v-bind="args" /></div>',
	}),
	args: {
		ariaLabel: 'Sample activity chart',
		series: [series('Notes', 'area', [2, 5, 3, 8, 6, 9]), series('Replies', 'bar', [1, 2, 1, 4, 3, 5])],
	},
	parameters: {
		layout: 'centered',
	},
} satisfies StoryObj<typeof MkDataChart>;

/**
 * echarts (zrender) はコンテナの矩形と clientX/clientY からプロット位置を出す。
 * userEvent の合成イベントでは座標が伝わらないので、実の MouseEvent を投げる。
 */
function hoverCenter(canvasElement: HTMLElement): SVGElement {
	const svg = canvasElement.querySelector('svg');
	expect(svg, 'echarts の svg').not.toBeNull();

	const box = svg!.getBoundingClientRect();
	const clientX = box.x + box.width / 2;
	const clientY = box.y + box.height / 2;

	for (const type of ['mouseover', 'mousemove']) {
		svg!.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true }));
	}

	return svg!;
}

export const Default = {
	...Base,
	async play({ canvasElement }) {
		const svg = hoverCenter(canvasElement);

		// 図形が出ていれば描画自体は成立している。
		expect(svg.querySelectorAll('path, rect').length).toBeGreaterThan(0);

		// detailed の既定は true なので軸ラベルが出る。時刻の目盛りで確かめる。
		const axisLabels = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
		expect(
			axisLabels.some((t) => /^\d{2}:\d{2}$/.test(t)),
			`時刻の軸ラベル: ${axisLabels.join(',')}`,
		).toBe(true);

		// 凡例は svg ではなく HTML 側に出る。
		const summary = [...canvasElement.querySelectorAll('[class*="summaryLabel"]')].map((e) => e.textContent ?? '');
		expect(summary.join(' ')).toContain('Notes');
		expect(summary.join(' ')).toContain('Replies');

		// ホバーで tooltip が出る。描画だけ見ても回帰は捕まらない。
		// 系列名は凡例にも出るので、tooltip にしか無い時刻で特定する
		// (origin は UTC 0 時なので、CI の UTC でも JST でも日付は変わらない)。
		const canvas = within(canvasElement);
		await waitFor(() => expect(canvas.getByText(/2026-08-01/)).toBeInTheDocument());

		// 時刻と系列は tooltip 内の別要素なので、両方を含む祖先まで辿る。
		let tooltip: HTMLElement | null = canvas.getByText(/2026-08-01/);
		while (tooltip != null && !(tooltip.textContent ?? '').includes('Notes')) {
			tooltip = tooltip.parentElement;
		}
		expect(tooltip, '時刻と系列を同時に含む tooltip').not.toBeNull();
		expect(tooltip).toHaveTextContent('Replies');
	},
} satisfies StoryObj<typeof MkDataChart>;

/**
 * `detailed: false` は MkChart が使う形。軸ラベルと dataZoom が落ちる。
 * 既定は true なので、落ちることを見るにはこちらを明示する必要がある。
 */
export const Compact = {
	...Base,
	args: {
		...Base.args,
		detailed: false,
	},
	async play({ canvasElement }) {
		const svg = hoverCenter(canvasElement);

		expect(svg.querySelectorAll('path, rect').length).toBeGreaterThan(0);
		expect([...svg.querySelectorAll('text')], '軸ラベルは出ない').toHaveLength(0);

		// 軸を落としても凡例とホバーは残る。
		const canvas = within(canvasElement);
		expect(canvas.getAllByText(/Notes|Replies/).length).toBeGreaterThan(0);
		await waitFor(() => expect(canvas.getByText(/2026-08-01/)).toBeInTheDocument());
	},
} satisfies StoryObj<typeof MkDataChart>;

export const SingleSeries = {
	...Base,
	args: {
		...Base.args,
		series: [series('Notes', 'line', [4, 7, 5, 9, 8, 12])],
	},
} satisfies StoryObj<typeof MkDataChart>;

export const Empty = {
	...Base,
	args: {
		...Base.args,
		series: [],
	},
} satisfies StoryObj<typeof MkDataChart>;
