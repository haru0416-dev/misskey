/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserInDatabase, createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveUserForApi } from '@/server/rest/activitypub/ap-person.js';
import type { ApiApPersonDependencies } from '@/server/rest/activitypub/ap-person.js';

describe('resolveUserForApi', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiApPersonDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-resolve-user') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('host=nullの場合はローカルユーザーを解決する', async () => {
		const id = genId();
		const username = `honoresolveuser${id}`;
		await createUserInDatabase(runtime.db, { id, username, usernameLower: username.toLowerCase() });

		const resolved = await resolveUserForApi(deps, username, null);
		expect(resolved.id).toBe(id);
		expect(resolved.host).toBeNull();
	});

	test('hostが自ホストの場合もローカルユーザーを解決する', async () => {
		const id = genId();
		const username = `honoresolveuser${id}`;
		await createUserInDatabase(runtime.db, { id, username, usernameLower: username.toLowerCase() });

		const resolved = await resolveUserForApi(deps, username, runtime.config.runtime.host);
		expect(resolved.id).toBe(id);
	});

	test('存在しないローカルユーザーはエラーを投げる', async () => {
		await expect(resolveUserForApi(deps, 'nonexistent-user-xyz', null)).rejects.toThrow('user not found');
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

		const resolved = await resolveUserForApi(deps, username, host);
		expect(resolved.id).toBe(remoteUser.id);
	});
});
