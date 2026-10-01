/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	deleteUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
} from '@/core/user/UserStore.js';
import { createFollowingInDatabase } from '@/core/user/FollowingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiUser } from '@/models/User.js';
import { packUserDetailedNotMeManyForApi } from '@/server/rest/user/user.js';
import { packFollowingsForApi } from '@/server/rest/user/following.js';

// 一覧の取得後、整形前に user 行の削除が確定すると、プロフィールやフォローも cascade で消える。
// 取得時の行が残っていても、削除された相手を一覧から除外する必要がある。
describe('一覧の取得後に削除が確定したユーザーの整形', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createUser(): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `packdel${id}`, usernameLower: `packdel${id}` },
			profile: { userId: id },
		});
	}

	test('フォロー一覧は、削除が確定した相手の行を外して返す', async () => {
		const [follower, deleted, alive] = await Promise.all([createUser(), createUser(), createUser()]);
		const [toDeleted, toAlive] = await Promise.all([
			createFollowingInDatabase(runtime.db, { id: genId(), followerId: follower.id, followeeId: deleted.id }),
			createFollowingInDatabase(runtime.db, { id: genId(), followerId: follower.id, followeeId: alive.id }),
		]);
		// 一覧のクエリで読んだ時点の行 (相手のユーザー行を含む) を持ったまま、削除を確定させる。
		const rows = [
			{ ...toDeleted, followee: await fetchUserByIdOrFailFromDatabase(runtime.db, deleted.id) },
			{ ...toAlive, followee: await fetchUserByIdOrFailFromDatabase(runtime.db, alive.id) },
		];
		await deleteUserByIdFromDatabase(runtime.db, deleted.id);

		const packed = await packFollowingsForApi(runtime, rows);

		expect(packed.map((item) => item.followeeId)).toEqual([alive.id]);
		expect(packed[0]!.followee.id).toBe(alive.id);
	});

	test('id で渡したユーザーの削除が確定していたら、その位置は null で並びは保つ', async () => {
		const [viewer, deleted, alive] = await Promise.all([createUser(), createUser(), createUser()]);
		await deleteUserByIdFromDatabase(runtime.db, deleted.id);

		const packed = await packUserDetailedNotMeManyForApi(runtime, [deleted.id, alive.id], viewer);

		expect(packed[0]).toBeNull();
		expect(packed[1]?.id).toBe(alive.id);
	});
});
