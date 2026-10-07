/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import * as Misskey from 'misskey-js';
import {
	APIResponseError,
	misskeyApi,
	prepareMisskeyApiRequest,
	pendingApiRequestsCount,
} from '@/utility/misskey-api.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';

vi.mock('@/i.js', () => ({ $i: { id: 'account-a', token: 'token-a' } }));

afterEach(() => {
	queryClient.clear();
	vi.restoreAllMocks();
});

describe('API credential selection', () => {
	test.each([
		{ body: 'token-b', explicit: undefined, expected: 'Bearer token-b', owner: undefined },
		{ body: null, explicit: undefined, expected: null, owner: null },
		{ body: undefined, explicit: undefined, expected: 'Bearer token-a', owner: 'account-a' },
		{ body: 'token-b', explicit: 'token-a', expected: 'Bearer token-a', owner: 'account-a' },
		{ body: 'token-a', explicit: null, expected: null, owner: null },
	])(
		'uses the selected credential and its conservative owner: $body / $explicit',
		async ({ body, explicit, expected, owner }) => {
			const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
			const request = prepareMisskeyApiRequest(
				'users/show',
				{ userId: 'user-a', ...(body === undefined ? {} : { i: body }) },
				explicit,
			);
			expect(request.accountId).toBe(owner);
			await request.execute();
			expect(fetch).toHaveBeenCalledOnce();
			const [, init] = fetch.mock.calls[0]!;
			expect(new Headers(init?.headers).get('Authorization')).toBe(expected);
			expect(JSON.parse(String(init?.body))).toEqual({ userId: 'user-a' });
		},
	);

	test('body-only unknown credentials bypass shared reads and do not invalidate another account', async () => {
		const key = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });
		queryClient.setQueryData(key, { id: 'user-a', name: 'Account A snapshot' });
		const fetch = vi.spyOn(window, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
		await misskeyApi('users/show', { userId: 'user-a', i: 'token-b' });
		await misskeyApi('users/show', { userId: 'user-a', i: 'token-b' });
		await misskeyApi('i/update', { name: 'Account B', i: 'token-b' });
		expect(fetch.mock.calls).toHaveLength(3);
		expect(queryClient.getQueryData(key)).toEqual({ id: 'user-a', name: 'Account A snapshot' });
		expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
	});
});

describe('API response failures', () => {
	test.each([null, 'gateway failed', { message: 'gateway failed' }, { error: 'unstructured' }, ['gateway']])(
		'preserves an unstructured response in a safe Error: %j',
		async (body) => {
			vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 502 }));
			const before = pendingApiRequestsCount.value;
			const failure = await misskeyApi('notes/show', { noteId: 'note-a' }, null).then(
				() => null,
				(error: unknown) => error,
			);
			expect(failure).toBeInstanceOf(APIResponseError);
			expect(failure).toMatchObject({ endpoint: 'notes/show', status: 502, body, cause: body });
			expect((failure as Error).message).toContain('502');
			expect(pendingApiRequestsCount.value).toBe(before);
		},
	);

	test('keeps structured errors as APIError and preserves their complete diagnostic contract', async () => {
		const error = {
			code: 'NO_SUCH_NOTE',
			id: 'no-note',
			kind: 'client',
			message: 'Not found',
			info: { noteId: 'note-a' },
		};
		vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error }), { status: 404 }));
		const failure = await misskeyApi('notes/show', { noteId: 'note-a' }, null).then(
			() => null,
			(reason: unknown) => reason,
		);
		expect(failure).toBeInstanceOf(Misskey.api.APIError);
		expect(failure).toMatchObject({ endpoint: 'notes/show', status: 404, ...error });
	});
});
