/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick } from 'vue';
import type * as Misskey from 'misskey-js';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api, misskeyApiGet: api }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self' }) }));
vi.mock('@/widgets/widget.js', () => ({
	useWidgetPropsManager: () => ({ widgetProps: { transparent: true }, configure: vi.fn() }),
}));

import MkChatHistories from '@/features/chat/components/MkChatHistories.vue';
import WidgetOnlineUsers from '@/widgets/WidgetOnlineUsers.vue';
import StatusbarRss from '@/ui/common/statusbar-rss.vue';

const resultStub = defineComponent({
	props: ['type'],
	setup: (props) => () => h('div', { 'data-result': props['type'] }),
});

async function settle() {
	await vi.advanceTimersByTimeAsync(0);
	await nextTick();
}

describe('polling consumer completion', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		api.mockReset();
	});

	test('online counts wait for the request before scheduling the next update', async () => {
		vi.useFakeTimers();
		const first = Promise.withResolvers<{ count: number }>();
		api.mockReturnValueOnce(first.promise).mockResolvedValue({ count: 7 });
		const view = render(WidgetOnlineUsers, {
			global: { stubs: { I18n: { template: '<span><slot name="n"/></span>' } } },
		});

		await vi.advanceTimersByTimeAsync(60_000);
		expect(api).toHaveBeenCalledTimes(1);
		first.resolve({ count: 3 });
		await settle();
		expect(view.container.textContent).toContain('3');
		await vi.advanceTimersByTimeAsync(15_000);
		expect(api).toHaveBeenCalledTimes(2);
		expect(view.container.textContent).toContain('7');
	});

	test('RSS polling owns JSON decoding as well as the HTTP response', async () => {
		vi.useFakeTimers();
		const decoded = Promise.withResolvers<Misskey.entities.FetchRssResponse>();
		const response = new Response('{}');
		vi.spyOn(response, 'json').mockReturnValue(decoded.promise);
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(response);
		const view = render(StatusbarRss, {
			props: { url: 'https://example.com/feed', refreshIntervalSec: 5, display: 'marquee' },
			global: { stubs: { MkMarqueeText: { template: '<div><slot/></div>' } } },
		});

		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetch).toHaveBeenCalledTimes(1);
		decoded.resolve({
			items: [{ title: 'decoded entry', link: 'https://example.com/entry' }],
		} as Misskey.entities.FetchRssResponse);
		await settle();
		expect(view.getByRole('link', { name: 'decoded entry' }).getAttribute('href')).toBe('https://example.com/entry');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test('chat waits for both requests after failure, shows the error, and recovers on the next poll', async () => {
		vi.useFakeTimers();
		const users = Promise.withResolvers<Misskey.entities.ChatMessage[]>();
		const rooms = Promise.withResolvers<Misskey.entities.ChatMessage[]>();
		api.mockReturnValueOnce(users.promise).mockReturnValueOnce(rooms.promise).mockResolvedValue([]);
		const view = render(MkChatHistories, {
			global: { stubs: { MkResult: resultStub, MkLoading: { template: '<div data-loading/>' } } },
		});

		rooms.reject(new Error('room history unavailable'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(api).toHaveBeenCalledTimes(2);
		expect(view.container.querySelector('[data-loading]')).not.toBeNull();
		users.resolve([]);
		await settle();
		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(view.container.querySelector('[data-result="error"]')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(10_000);
		expect(api).toHaveBeenCalledTimes(4);
		expect(view.container.querySelector('[data-result="error"]')).toBeNull();
		expect(view.container.querySelector('[data-result="empty"]')).not.toBeNull();
	});
});
