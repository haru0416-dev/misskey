/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, test, vi } from 'vitest';

const { pending } = vi.hoisted(() => ({
	pending: new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>(),
}));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(
		(endpoint: string) =>
			new Promise((resolve, reject) => {
				pending.set(endpoint, { resolve, reject });
			}),
	),
}));

afterEach(() => {
	cleanup();
	pending.clear();
});

describe('MkHeatmap', () => {
	test('切り替え前の条件の応答が後から届いても、今の条件の表示を上書きしない', async () => {
		const MkHeatmap = (await import('@/features/chart/components/MkHeatmap.vue')).default;
		const { rerender, container } = render(MkHeatmap, { props: { src: 'active-users' } });
		await vi.waitFor(() => expect(pending.has('charts/active-users')).toBe(true));

		await rerender({ src: 'notes' });
		await vi.waitFor(() => expect(pending.has('charts/notes')).toBe(true));
		pending.get('charts/notes')!.resolve({ local: { inc: [7, 7, 7] } });
		await vi.waitFor(() => expect(container.querySelector('[title$=": 7"]')).not.toBeNull());
		pending.get('charts/active-users')!.resolve({ readWrite: [3, 3, 3] });
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(container.querySelector('[title$=": 3"]')).toBeNull();
		expect(container.querySelectorAll('[title$=": 7"]')).toHaveLength(3);
	});

	test('取得に失敗したら読み込み中を終える', async () => {
		const MkHeatmap = (await import('@/features/chart/components/MkHeatmap.vue')).default;
		const { container } = render(MkHeatmap, { props: { src: 'active-users' } });
		await vi.waitFor(() => expect(pending.has('charts/active-users')).toBe(true));
		pending.get('charts/active-users')!.reject(new TypeError('Failed to fetch'));

		await vi.waitFor(() => expect(container.querySelector('[class*="empty"]')).not.toBeNull());
	});
});
