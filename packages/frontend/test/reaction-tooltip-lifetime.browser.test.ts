/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';

const { request, openPopup } = vi.hoisted(() => ({
	request: vi.fn(),
	openPopup: vi.fn((_component: unknown, _props: Record<string, unknown>, _events?: Record<string, unknown>) => ({
		dispose: vi.fn(),
	})),
}));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApiGet: request,
	misskeyApi: vi.fn(() => {
		throw new Error('Unexpected reaction mutation');
	}),
}));
vi.mock('@/os.js', () => ({
	popup: openPopup,
}));

import MkReaction from '@/features/note/components/MkReactionsViewer.Reaction.vue';

const props = { noteId: 'note-id', reaction: '❤️', reactionEmojis: {}, myReaction: null, count: 1, isInitial: true };

describe('reaction tooltip completion ownership', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		request.mockReset();
		openPopup.mockClear();
	});

	test.each(['mouseleave', 'unmount'] as const)(
		'does not open the canceled response after %s, but preserves a fresh hover',
		async (exit) => {
			vi.useFakeTimers();
			const oldResponse = Promise.withResolvers<unknown>();
			const freshResponse = Promise.withResolvers<unknown>();
			request.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);
			let owner = render(MkReaction, { props, global: { directives: { ripple: {} } } });
			await nextTick();
			await fireEvent.mouseOver(owner.getByRole('button'));
			await vi.advanceTimersByTimeAsync(100);
			expect(request).toHaveBeenCalledOnce();
			if (exit === 'unmount') {
				owner.unmount();
				owner = render(MkReaction, { props, global: { directives: { ripple: {} } } });
			} else {
				await fireEvent.mouseLeave(owner.getByRole('button'));
			}
			oldResponse.resolve([{ user: { id: 'canceled-user' } }]);
			await nextTick();
			await fireEvent.mouseOver(owner.getByRole('button'));
			await vi.advanceTimersByTimeAsync(100);
			freshResponse.resolve([{ user: { id: 'fresh-user' } }]);
			await vi.waitFor(() => {
				expect(openPopup).toHaveBeenCalledOnce();
				expect(openPopup.mock.calls[0]![1]['users']).toEqual([{ id: 'fresh-user' }]);
			});
		},
	);
});
