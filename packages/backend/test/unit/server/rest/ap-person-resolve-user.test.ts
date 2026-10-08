/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserInDatabase,
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdFromDatabase,
} from '@/core/user/user-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveUser } from '@/server/rest/activitypub/ap-person.js';
import type { ApPersonDependencies } from '@/server/rest/activitypub/ap-person.js';

describe('resolveUser', () => {
	let runtime: RuntimeDependencies;
	let deps: ApPersonDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-resolve-user') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('host=null と自ホストは同じローカルユーザーを解決する', async () => {
		const id = genId();
		const username = `honoresolveuser${id}`;
		await createUserInDatabase(runtime.db, { id, username, usernameLower: username.toLowerCase() });

		for (const host of [null, runtime.config.runtime.host]) {
			const resolved = await resolveUser(deps, username, host);
			expect(resolved.id).toBe(id);
			expect(resolved.host).toBeNull();
		}
	});

	test('存在しないローカルユーザーはエラーを投げる', async () => {
		await expect(resolveUser(deps, 'nonexistent-user-xyz', null)).rejects.toThrow('user not found');
	});

	test('lastFetchedAtが新しいリモートユーザーはWebFingerせずそのまま返す', async () => {
		const id = genId();
		const username = `honoresolveuser${id}`;
		const host = `honoresolveuser-${id}.example.com`;
		const remoteUser = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id,
				username,
				usernameLower: username.toLowerCase(),
				host,
				uri: `https://${host}/users/${id}`,
				lastFetchedAt: new Date(),
			},
			profile: { userId: id },
		});

		const resolved = await resolveUser(deps, username, host);
		expect(resolved.id).toBe(remoteUser.id);
	});

	test('ポート付きのリモートユーザーの再同期で、WebFinger が返した同じホストの URI を受け入れる', async () => {
		const id = genId();
		const username = `honoresolveport${id}`;
		const host = `honoresolveport-${id}.example.com:8443`;
		await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id,
				username,
				usernameLower: username.toLowerCase(),
				host,
				uri: `https://${host}/users/old-${id}`,
				lastFetchedAt: null,
			},
			profile: { userId: id },
		});
		const newUri = `https://${host}/users/new-${id}`;
		const requestedUrls: string[] = [];
		const offline = new Error('offline in test');
		const getJson = vi.fn(async (url: string) => {
			requestedUrls.push(url);
			if (url.includes('/.well-known/webfinger')) {
				return { subject: `acct:${username}@${host}`, links: [{ rel: 'self', href: newUri }] };
			}
			throw offline;
		});
		const send = vi.fn().mockRejectedValue(offline);

		// WebFinger の後の actor の取得は通信しないので失敗する。URI の照合を通ったかは保存された URI で見る。
		const error = await resolveUser(
			{ ...deps, httpRequestService: { ...deps.httpRequestService, getJson, send } as typeof deps.httpRequestService },
			username,
			host,
		).catch((e: unknown) => e);

		expect(String(error)).not.toContain('Invalid uri');
		expect(requestedUrls[0]).toContain(`https://${host}/.well-known/webfinger`);
		expect((await fetchUserByIdFromDatabase(runtime.db, id))?.uri).toBe(newUri);
	});
});
