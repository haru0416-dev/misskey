/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseApiParams } from '@/server/rest/validation.js';
import { xaddApiNotification } from '@/server/rest/notification/notification.js';
import { handleApiINotifications, notificationsParamDef } from '@/server/rest/notification/notifications-list.js';
import type { ApiNotificationsListDependencies } from '@/server/rest/notification/notifications-list.js';
import type { MiUser } from '@/models/User.js';

// 日時で指定した境界は、日時から作った ID (ストリームに存在しない) で引くので完全一致の検索が必ず外れる。
// そこから遅延通知用の全件探索に落ちると、要求のたびにストリーム全体を読んで JSON を解析する。
describe('i/notifications の日時による境界', () => {
	let runtime: RuntimeDependencies;
	let user: MiUser;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		const id = genId();
		user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `notifdate${id}`, usernameLower: `notifdate${id}` },
			profile: { userId: id },
		});
	});

	afterAll(async () => {
		await runtime.redis.del(`notificationTimeline:${user.id}`);
		await deleteUserByIdFromDatabase(runtime.db, user.id);
		await runtime.dispose();
	});

	test('untilDate / sinceDate はストリーム全体を探索せずに時刻で区切る', async () => {
		const base = Date.now() - 10 * 60_000;
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const at = base + i * 60_000;
			const id = genId(at);
			ids.push(id);
			await xaddApiNotification(runtime, user.id, { id, type: 'test', createdAt: new Date(at).toISOString() });
		}
		const xrevrange = vi.spyOn(runtime.redis, 'xrevrange');
		const deps = runtime as unknown as ApiNotificationsListDependencies;

		const until = await handleApiINotifications(
			deps,
			user,
			parseApiParams(notificationsParamDef, { untilDate: base + 90_000, markAsRead: false }),
		);
		const since = await handleApiINotifications(
			deps,
			user,
			parseApiParams(notificationsParamDef, { sinceDate: base + 30_000, markAsRead: false }),
		);

		expect(until.map((n) => n['id'])).toStrictEqual([ids[1], ids[0]]);
		expect(since.map((n) => n['id']).toSorted()).toStrictEqual([ids[1], ids[2]].toSorted());
		// 件数の指定が無い XREVRANGE + - はストリーム全体の読み出し。
		const fullScans = xrevrange.mock.calls.filter((args) => args[1] === '+' && args[2] === '-' && args.length === 3);
		expect(fullScans).toHaveLength(0);
		xrevrange.mockRestore();
	});
});
