/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: request,
	prepareMisskeyApiRequest: vi.fn(() => {
		throw new Error('Unexpected request preparation');
	}),
}));
vi.mock('@/features/user/components/MkFollowButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/features/user/get-user-menu.js', () => ({ getUserMenu: vi.fn() }));

import MkUserPopup from '@/features/user/components/MkUserPopup.vue';

describe('cold user preview cancellation', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		request.mockReset();
	});

	test('reports a canceled opening as closed without fetching or reading its removed anchor', async () => {
		const source = document.createElement('button');
		const geometry = vi.spyOn(source, 'getBoundingClientRect');
		const closed = vi.fn();
		render(MkUserPopup, { props: { showing: false, q: 'user-id', source, onClosed: closed } });
		await nextTick();
		expect(closed).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
		expect(geometry).not.toHaveBeenCalled();
	});
});
