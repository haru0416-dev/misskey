/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	updateUserLastActiveDateInDatabase,
} from '@/core/user/user-store.js';
import { createRoleInDatabase, deleteRoleFromDatabase } from '@/core/role/role-store.js';
import { createRoleAssignmentInDatabase } from '@/core/role/role-assignment-store.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/meta/meta-store.js';
import { listAnnouncementsForAdminFromDatabase } from '@/core/announcement/announcement-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueueCheckModeratorsActivity } from '@/queue/handlers/check-moderators-activity.js';
import type { QueueCheckModeratorsActivityDependencies } from '@/queue/handlers/check-moderators-activity.js';
import type { MiUser } from '@/models/User.js';

// アクティブなモデレーターが 1 人でも残ると、後のテストで招待制に切り替わらない。テストごとにロールを消す
// (割り当ては外部キーで一緒に消える)。
const createdRoleIds: string[] = [];

async function createModeratorTestUser(
	runtime: RuntimeDependencies,
	prefix: string,
	lastActiveDate: Date,
): Promise<MiUser> {
	const id = genId();
	const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
		profile: { userId: id },
	});
	const roleId = genId();
	await createRoleInDatabase(runtime.db, {
		id: roleId,
		name: `${prefix}role${roleId}`,
		description: '',
		updatedAt: new Date(),
		lastUsedAt: new Date(),
		isModerator: true,
	});
	createdRoleIds.push(roleId);
	await createRoleAssignmentInDatabase(runtime.db, { id: genId(), userId: user.id, roleId, expiresAt: null });
	await updateUserLastActiveDateInDatabase(runtime.db, user.id, lastActiveDate);
	return { ...user, lastActiveDate };
}

describe('hono-queue-check-moderators-activity', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueCheckModeratorsActivityDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	beforeEach(async () => {
		// 前回セッションの残留状態 (永続DBコンテナ) を引き継がないよう、各テスト開始前にリセットする
		const { after } = await updateMetaInDatabase(runtime.db, { disableRegistration: false });
		Object.assign(runtime.meta, after);
	});

	afterEach(async () => {
		for (const roleId of createdRoleIds.splice(0)) {
			await deleteRoleFromDatabase(runtime.db, roleId);
		}
		// disableRegistration をリセットし、テスト間の影響を防ぐ。
		const { after } = await updateMetaInDatabase(runtime.db, { disableRegistration: false });
		Object.assign(runtime.meta, after);
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('モデレーターが7日以上非アクティブなら招待制に切り替え、お知らせを作成する', async () => {
		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		const moderator = await createModeratorTestUser(runtime, 'honoqueuecma1', eightDaysAgo);

		await handleQueueCheckModeratorsActivity(deps);

		const meta = await fetchMetaFromDatabase(runtime.db);
		expect(meta.disableRegistration).toBe(true);
		expect(runtime.meta.disableRegistration).toBe(true);

		const announcements = await listAnnouncementsForAdminFromDatabase(runtime.db, {
			limit: 10,
			order: 'desc',
			status: 'all',
			userId: moderator.id,
		});
		expect(announcements.length).toBeGreaterThan(0);
	});

	test('既に招待制の場合は何もしない', async () => {
		const { after } = await updateMetaInDatabase(runtime.db, { disableRegistration: true });
		Object.assign(runtime.meta, after);

		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		const moderator = await createModeratorTestUser(runtime, 'honoqueuecma2', eightDaysAgo);

		await handleQueueCheckModeratorsActivity(deps);

		const announcements = await listAnnouncementsForAdminFromDatabase(runtime.db, {
			limit: 10,
			order: 'desc',
			status: 'all',
			userId: moderator.id,
		});
		expect(announcements).toHaveLength(0);
	});

	test('モデレーターがアクティブなら招待制に切り替わらない', async () => {
		await createModeratorTestUser(runtime, 'honoqueuecma3', new Date());

		await handleQueueCheckModeratorsActivity(deps);

		const meta = await fetchMetaFromDatabase(runtime.db);
		expect(meta.disableRegistration).toBe(false);
	});
});
