/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	createRoleAssignmentInDatabase,
	deleteRoleAssignmentByUserIdAndRoleIdFromDatabase,
	listRoleAssignmentsByUserIdFromDatabaseCachedByVersion,
} from '@/core/role/RoleAssignmentStore.js';
import {
	createRoleInDatabase,
	deleteRoleInDatabase,
	fetchRolesCacheVersionFromDatabase,
	listRolesFromDatabaseCachedByVersion,
	updateRoleInDatabase,
} from '@/core/role/RoleStore.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchLocalUserByNativeTokenWithRolesVersionFromDatabase,
} from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { resetDb } from '@/misc/reset-db.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

/*
 * ロールのプロセス内キャッシュは DB トリガが進める世代番号で新旧を判定する。
 * 書き込み経路が Store 関数直呼びでも (= 別プロセスの e2e フィクスチャと同じ形でも) 世代が進み、
 * 次の読みで新しい内容になることを確かめる。
 */
describe('role cache version', () => {
	let runtime: RuntimeDependencies;
	let db: MiDrizzleDatabase;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		db = runtime.db;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	function roleValues(id: string) {
		return { id, name: `cacheversion${id}`, description: '', updatedAt: new Date(), lastUsedAt: new Date() };
	}

	test('every role write advances the version and the cached list follows the version', async () => {
		const v0 = await fetchRolesCacheVersionFromDatabase(db);
		const before = await listRolesFromDatabaseCachedByVersion(db, v0);

		const id = genId();
		await createRoleInDatabase(db, roleValues(id));
		const v1 = await fetchRolesCacheVersionFromDatabase(db);
		expect(v1).toBeGreaterThan(v0);

		// 古い世代を渡す限り古い内容のまま (同一リクエスト内での一貫性)
		expect(await listRolesFromDatabaseCachedByVersion(db, v0)).toBe(before);
		const after = await listRolesFromDatabaseCachedByVersion(db, v1);
		expect(after.map((role) => role.id)).toContain(id);
		expect(Object.isFrozen(after)).toBe(true);

		await updateRoleInDatabase(db, id, { name: 'renamed' });
		const v2 = await fetchRolesCacheVersionFromDatabase(db);
		expect(v2).toBeGreaterThan(v1);
		expect((await listRolesFromDatabaseCachedByVersion(db, v2)).find((role) => role.id === id)?.name).toBe('renamed');

		await deleteRoleInDatabase(db, id);
		const v3 = await fetchRolesCacheVersionFromDatabase(db);
		expect(v3).toBeGreaterThan(v2);
		expect((await listRolesFromDatabaseCachedByVersion(db, v3)).map((role) => role.id)).not.toContain(id);
	});

	test('assignment writes advance the version and the per-user cache follows it', async () => {
		const userId = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id: userId, username: `cacheversion${userId}`, usernameLower: `cacheversion${userId}` },
			profile: { userId },
		});
		const roleId = genId();
		await createRoleInDatabase(db, roleValues(roleId));

		const v0 = await fetchRolesCacheVersionFromDatabase(db);
		expect(await listRoleAssignmentsByUserIdFromDatabaseCachedByVersion(db, userId, v0)).toEqual([]);

		await createRoleAssignmentInDatabase(db, { id: genId(), userId, roleId, expiresAt: null });
		const v1 = await fetchRolesCacheVersionFromDatabase(db);
		expect(v1).toBeGreaterThan(v0);
		expect(await listRoleAssignmentsByUserIdFromDatabaseCachedByVersion(db, userId, v0)).toEqual([]);
		expect((await listRoleAssignmentsByUserIdFromDatabaseCachedByVersion(db, userId, v1)).map((a) => a.roleId)).toEqual(
			[roleId],
		);

		await deleteRoleAssignmentByUserIdAndRoleIdFromDatabase(db, userId, roleId);
		const v2 = await fetchRolesCacheVersionFromDatabase(db);
		expect(await listRoleAssignmentsByUserIdFromDatabaseCachedByVersion(db, userId, v2)).toEqual([]);
		await deleteRoleInDatabase(db, roleId);
	});

	test('the authentication query returns the same version as the direct read', async () => {
		const userId = genId();
		const token = `cachever${userId.slice(0, 8)}`;
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id: userId, username: `cacheverauth${userId}`, usernameLower: `cacheverauth${userId}`, token },
			profile: { userId },
		});
		const found = await fetchLocalUserByNativeTokenWithRolesVersionFromDatabase(db, token);
		expect(found?.user.id).toBe(userId);
		expect(found?.rolesVersion).toBe(await fetchRolesCacheVersionFromDatabase(db));
		expect(found?.user).not.toHaveProperty('rolesVersion');
		expect(await fetchLocalUserByNativeTokenWithRolesVersionFromDatabase(db, 'nosuchtoken0000')).toBeNull();
	});

	test('resetting test data preserves and advances the version so new roles invalidate the cache', async () => {
		const oldRoleId = genId();
		await createRoleInDatabase(db, roleValues(oldRoleId));
		const beforeReset = await fetchRolesCacheVersionFromDatabase(db);
		expect((await listRolesFromDatabaseCachedByVersion(db, beforeReset)).map((role) => role.id)).toContain(oldRoleId);

		await resetDb(runtime.drizzlePool);
		const afterReset = await fetchRolesCacheVersionFromDatabase(db);
		expect(afterReset).toBeGreaterThan(beforeReset);
		expect(await listRolesFromDatabaseCachedByVersion(db, afterReset)).toEqual([]);

		const newRoleId = genId();
		await createRoleInDatabase(db, roleValues(newRoleId));
		const afterCreate = await fetchRolesCacheVersionFromDatabase(db);
		expect(afterCreate).toBeGreaterThan(afterReset);
		expect((await listRolesFromDatabaseCachedByVersion(db, afterCreate)).map((role) => role.id)).toEqual([newRoleId]);
	});
});
