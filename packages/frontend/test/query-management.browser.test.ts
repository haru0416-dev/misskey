/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import type * as Misskey from 'misskey-js';
import MyLists from '@/pages/my-lists/index.vue';
import MyAntennas from '@/pages/my-antennas/index.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkError from '@/components/global/MkError.vue';
import { queryClient } from '@/query/client.js';
import { clipsCache } from '@/query/account-caches.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getNoteClipMenu } from '@/features/note/get-note-menu.js';
import { i18n } from '@/i18n.js';

vi.mock('@/i.js', () => {
	const account = {
		id: 'account-a',
		token: 'token-a',
		policies: { noteEachClipsLimit: 100, userEachUserListsLimit: 100 },
	};
	return { $i: account, ensureSignin: () => account };
});
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/store.js', () => ({ store: { state: {} } }));
vi.mock('@/features/post-composer/post.js', () => ({ post: vi.fn() }));
vi.mock('@/features/user/get-user-menu.js', () => ({ getUserMenu: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/os.js', () => {
	return {
		apiWithDialog: (endpoint: keyof Misskey.Endpoints, data: Misskey.Endpoints[keyof Misskey.Endpoints]['req']) =>
			misskeyApi(endpoint, data),
		promiseDialog: (
			promise: Promise<unknown>,
			success: ((value: unknown) => void) | null,
			failure: (error: unknown) => void,
		) => {
			void promise.then((value) => success?.(value), failure);
			return promise;
		},
		confirm: async () => ({ canceled: true }),
		alert: vi.fn(),
	};
});

const PageWithHeader = defineComponent({
	props: ['actions'],
	setup(props, { slots }) {
		return () =>
			h('main', [
				...(props.actions ?? []).map((action: { text: string; handler: () => void }) =>
					h('button', { onClick: action.handler }, action.text),
				),
				slots['default']?.(),
			]);
	},
});
const Button = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, slots }) {
		return () => h('button', attrs, slots['default']?.());
	},
});
const Slot = defineComponent({
	setup:
		(_, { slots }) =>
		() =>
			h('div', slots['default']?.()),
});
const pageOptions = {
	global: {
		components: {
			PageWithHeader,
			MkResult,
			MkError,
			MkLoading: defineComponent({ setup: () => () => h('div', { role: 'status' }, 'Loading') }),
		},
		stubs: { MkButton: Button, MkA: Slot, MkTip: Slot, MkAvatars: true, MkSystemIcon: true },
	},
};

beforeEach(() => queryClient.clear());
afterEach(() => {
	cleanup();
	queryClient.clear();
	vi.restoreAllMocks();
});

describe.each([
	{
		title: 'lists',
		component: MyLists,
		endpoint: 'users/lists/list',
		rows: [{ id: 'list-a', name: 'Retained list', userIds: [] }],
	},
	{
		title: 'antennas',
		component: MyAntennas,
		endpoint: 'antennas/list',
		rows: [{ id: 'antenna-a', name: 'Retained antenna' }],
	},
])('$title management', ({ component, endpoint, rows }) => {
	test('shows initial errors, retries successfully, and displays refresh failure without erasing rows', async () => {
		let offline = true;
		const rejected: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => rejected.push(event.reason);
		window.addEventListener('unhandledrejection', onRejection);
		vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
			if (!String(url).endsWith(`/${endpoint}`)) throw new Error(`Unexpected transport: ${url}`);
			if (offline) throw new TypeError('offline');
			return new Response(JSON.stringify(rows), { status: 200 });
		});
		try {
			const screen = render(component, pageOptions);
			expect(screen.getByRole('status')).toBeTruthy();
			expect(screen.queryByText(i18n.ts.nothing)).toBeNull();
			await waitFor(() => expect(screen.getByText(i18n.ts.somethingHappened)).toBeTruthy());
			expect(screen.queryByText(i18n.ts.nothing)).toBeNull();
			offline = false;
			await fireEvent.click(screen.getByRole('button', { name: i18n.ts.retry }));
			await waitFor(() => expect(screen.getByText(rows[0]!.name)).toBeTruthy());
			offline = true;
			await fireEvent.click(screen.getByRole('button', { name: i18n.ts.reload }));
			await waitFor(() => expect(screen.getByText(i18n.ts.somethingHappened)).toBeTruthy());
			expect(screen.getByText(rows[0]!.name)).toBeTruthy();
			expect(rejected).toEqual([]);
		} finally {
			window.removeEventListener('unhandledrejection', onRejection);
		}
	});
});

test.each([null, 'gateway failed', { message: 'gateway failed' }])(
	'malformed responses leave the management page in a recoverable error state: %j',
	async (body) => {
		vi.spyOn(window, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status: 502 }));
		const screen = render(MyAntennas, pageOptions);
		await waitFor(() => expect(screen.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
		expect(screen.getByText(i18n.ts.somethingHappened)).toBeTruthy();
		expect(screen.queryByText(i18n.ts.nothing)).toBeNull();
	},
);

test('old clip menus cannot erase a later clip or another menu count update', async () => {
	let clips = [{ id: 'clip-a', userId: 'account-a', name: 'Existing', notesCount: 0 }];
	vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
		const endpoint = String(url).split('/api/')[1];
		const data = JSON.parse(String(init?.body));
		if (endpoint === 'clips/list') return new Response(JSON.stringify(clips), { status: 200 });
		if (endpoint === 'clips/create') {
			const created = { id: 'clip-b', userId: 'account-a', name: data.name, notesCount: 0 };
			clips = [...clips, created];
			return new Response(JSON.stringify(created), { status: 200 });
		}
		if (endpoint === 'clips/add-note') {
			clips = clips.map((clip) => (clip.id === data.clipId ? { ...clip, notesCount: clip.notesCount + 1 } : clip));
			return new Response(null, { status: 204 });
		}
		throw new Error(`Unexpected transport: ${url}`);
	});
	const note = (id: string) => ({ id, text: 'note', renoteId: null }) as Misskey.entities.Note;
	const first = await getNoteClipMenu({ note: note('note-a') });
	const second = await getNoteClipMenu({ note: note('note-b') });
	await misskeyApi('clips/create', { name: 'Created later', isPublic: false });
	await clipsCache.fetch();
	const act = (menu: typeof first) => {
		const item = menu[0];
		if (item == null || typeof item !== 'object' || !('action' in item)) throw new Error('Missing clip action');
		item.action(new PointerEvent('click'));
	};
	act(first);
	await waitFor(() => expect(clipsCache.value.value?.find((clip) => clip.id === 'clip-a')?.notesCount).toBe(1));
	act(second);
	await waitFor(() => expect(clipsCache.value.value?.find((clip) => clip.id === 'clip-a')?.notesCount).toBe(2));
	const current = await getNoteClipMenu({ note: note('note-c') });
	expect(current).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ text: 'Existing (2/100)' }),
			expect.objectContaining({ text: 'Created later (0/100)' }),
		]),
	);
});
