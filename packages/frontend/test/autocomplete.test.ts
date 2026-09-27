/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

const pending = new Map<string, (users: unknown[]) => void>();
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(
		(endpoint: string, params: { username: string }) =>
			new Promise((resolve) => {
				if (endpoint === 'users/search-by-username-and-host') pending.set(params.username, resolve);
			}),
	),
}));
vi.mock('@/i.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/i.js')>()),
	$i: { id: 'me', policies: { chatAvailability: 'available' } },
}));

const user = (username: string) => ({
	id: username,
	username,
	host: null,
	name: null,
	avatarUrl: '',
	avatarBlurhash: null,
	avatarDecorations: [],
	emojis: {},
	onlineStatus: 'unknown',
	badgeRoles: [],
});

afterEach(() => {
	cleanup();
	pending.clear();
	sessionStorage.clear();
});

describe('MkAutocomplete', () => {
	test('後から届いた古い検索結果で、今の入力の候補を上書きしない', async () => {
		const MkAutocomplete = (await import('@/features/autocomplete/components/MkAutocomplete.vue')).default;
		const textarea = document.createElement('textarea');
		document.body.appendChild(textarea);
		const props = { type: 'user' as const, q: 'al', textarea, close: () => {}, x: 0, y: 0 };
		const { rerender, container } = render(MkAutocomplete, { props });
		await vi.waitFor(() => expect(pending.has('al')).toBe(true));

		await rerender({ ...props, q: 'ali' });
		await vi.waitFor(() => expect(pending.has('ali')).toBe(true));
		pending.get('ali')!([user('alice')]);
		await nextTick();
		pending.get('al')!([user('alex')]);
		await nextTick();
		await nextTick();

		expect(container.textContent).toContain('@alice');
		expect(container.textContent).not.toContain('@alex');
		expect(sessionStorage.getItem('autocomplete:user:me:al')).toBeNull();
	});
});
