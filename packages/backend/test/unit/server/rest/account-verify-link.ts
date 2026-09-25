/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { verifyLinkForApi } from '@/server/rest/account/account-update.js';
import type { ApiAccountUpdateDependencies } from '@/server/rest/account/account-update.js';
import type { MiLocalUser } from '@/models/User.js';

// プロフィールのリンク検証。値は SQL へパラメータで渡すので、% や ' を含む URL も検証の対象にする。
describe('verifyLinkForApi', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	const verify = async (url: string) => {
		const id = genId();
		const username = `verifylink${id}`;
		const user = (await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username, usernameLower: username },
			profile: { userId: id },
		})) as MiLocalUser;
		const deps = {
			...runtime,
			httpRequestService: {
				getHtml: async () => `<a rel="me" href="${runtime.config.instance.url}/@${username}">me</a>`,
			},
		} as unknown as ApiAccountUpdateDependencies;
		await verifyLinkForApi(deps, url, user);
		return (await fetchUserProfileByUserIdOrFailFromDatabase(runtime.db, id)).verifiedLinks;
	};

	test('パーセントエンコードや引用符を含む URL も検証する', async () => {
		const url = "https://example.com/%E3%81%82?q=it's";
		expect(await verify(url)).toStrictEqual([url]);
	});

	test('URL として解釈できない値は検証しない', async () => {
		expect(await verify('https://')).toStrictEqual([]);
	});
});
