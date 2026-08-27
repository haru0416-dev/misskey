/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import { fetchUserListByNameAndUserIdFromDatabase } from '@/core/user/UserListStore.js';
import { userListMembershipExistsInDatabase } from '@/core/user/UserListMembershipStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleQueueImportUserLists, type QueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbUserImportJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob(data: DbUserImportJobData): Bull.Job<DbUserImportJobData> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbUserImportJobData>;
}

async function serveText(text: string): Promise<{ url: string; server: Server }> {
	const server: Server = createServer((_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/csv' });
		res.end(text);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address() as AddressInfo;
	return { url: `http://127.0.0.1:${address.port}/export.csv`, server };
}

describe('hono-queue-db (importUserLists)', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueDbDependencies;
	let servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-import-user-lists') };
	});

	afterEach(() => {
		for (const server of servers) server.close();
		servers = [];
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createTestUser(prefix: string): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
			profile: { userId: id },
		});
	}

	test('CSVに記載されたリストへローカルユーザーをメンバー追加する (リストは自動作成)', async () => {
		const owner = await createTestUser('honoqueueimpulowner');
		const member = await createTestUser('honoqueueimpulmember');
		const listName = `imported-list-${genId()}`;

		const { url, server } = await serveText(
			`${listName},${member.username}@${runtime.config.runtime.host},withReplies=true\n`,
		);
		servers.push(server);

		const fileId = genId();
		await createDriveFileInDatabase(runtime.db, {
			id: fileId,
			md5: 'dummy',
			name: 'lists.csv',
			type: 'text/csv',
			size: url.length,
			storedInternal: false,
			url,
			userId: owner.id,
			userHost: null,
		});

		await handleQueueImportUserLists(deps, fakeJob({ user: { id: owner.id }, fileId }));

		const list = await fetchUserListByNameAndUserIdFromDatabase(runtime.db, listName, owner.id);
		expect(list).not.toBeNull();
		expect(await userListMembershipExistsInDatabase(runtime.db, member.id, list!.id)).toBe(true);
	});

	test('存在しないfileIdは何もしない', async () => {
		const owner = await createTestUser('honoqueueimpulnofile');
		await expect(
			handleQueueImportUserLists(deps, fakeJob({ user: { id: owner.id }, fileId: genId() })),
		).resolves.toBeUndefined();
	});
});
