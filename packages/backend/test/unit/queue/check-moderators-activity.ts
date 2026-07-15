/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase, updateUserLastActiveDateInDatabase } from '@/core/UserStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { createRoleAssignmentInDatabase } from '@/core/RoleAssignmentStore.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/MetaStore.js';
import { listAnnouncementsForAdminFromDatabase } from '@/core/AnnouncementStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueCheckModeratorsActivity,
	type HonoQueueCheckModeratorsActivityDependencies,
} from '@/queue/handlers/check-moderators-activity.js';
import type { MiUser } from '@/models/User.js';

async function createModeratorTestUser(runtime: RuntimeDependencies, prefix: string, lastActiveDate: Date): Promise<MiUser> {
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
	await createRoleAssignmentInDatabase(runtime.db, { id: genId(), userId: user.id, roleId, expiresAt: null });
	await updateUserLastActiveDateInDatabase(runtime.db, user.id, lastActiveDate);
	return { ...user, lastActiveDate };
}

describe('hono-queue-check-moderators-activity', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueCheckModeratorsActivityDependencies;

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
		// disableRegistration をテスト間で汚染しないようリセットしておく
		const { after } = await updateMetaInDatabase(runtime.db, { disableRegistration: false });
		Object.assign(runtime.meta, after);
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('モデレーターが7日以上非アクティブなら招待制に切り替え、お知らせを作成する', async () => {
		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		const moderator = await createModeratorTestUser(runtime, 'honoqueuecma1', eightDaysAgo);

		await handleHonoQueueCheckModeratorsActivity(deps);

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
		expect(announcements[0]!.title).toContain('Invitation-Only');
	});

	test('既に招待制の場合は何もしない', async () => {
		const { after } = await updateMetaInDatabase(runtime.db, { disableRegistration: true });
		Object.assign(runtime.meta, after);

		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		const moderator = await createModeratorTestUser(runtime, 'honoqueuecma2', eightDaysAgo);

		await handleHonoQueueCheckModeratorsActivity(deps);

		const announcements = await listAnnouncementsForAdminFromDatabase(runtime.db, {
			limit: 10,
			order: 'desc',
			status: 'all',
			userId: moderator.id,
		});
		expect(announcements.length).toBe(0);
	});

	test('モデレーターがアクティブなら招待制に切り替わらない', async () => {
		await createModeratorTestUser(runtime, 'honoqueuecma3', new Date());

		await handleHonoQueueCheckModeratorsActivity(deps);

		const meta = await fetchMetaFromDatabase(runtime.db);
		expect(meta.disableRegistration).toBe(false);
	});
});
