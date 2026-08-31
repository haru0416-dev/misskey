/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義を避けるため、テスト用の固定値を注入する。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleQueueImportFollowing,
	handleQueueImportFollowingToDb,
	type QueueDbDependencies,
} from '@/queue/handlers/db.js';
import type { DbUserImportJobData, DbUserImportToDbJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob<T>(data: T): Bull.Job<T> {
	return { id: genId(), data, updateProgress: async () => {} } as unknown as Bull.Job<T>;
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

describe('hono-queue-db (importFollowing)', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueDbDependencies;
	let servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-import-following') };
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

	test('handleQueueImportFollowing: CSVの行ごとにimportFollowingToDbジョブを積む', async () => {
		const follower = await createTestUser('honoqueueimpfollowme');
		const followee = await createTestUser('honoqueueimpfollowtarget');

		const { url, server } = await serveText(`${followee.username}@${runtime.config.runtime.host},withReplies=true\n`);
		servers.push(server);

		const fileId = genId();
		await createDriveFileInDatabase(runtime.db, {
			id: fileId,
			md5: 'dummy',
			name: 'following.csv',
			type: 'text/csv',
			size: url.length,
			storedInternal: false,
			url,
			userId: follower.id,
			userHost: null,
		});

		await handleQueueImportFollowing(
			deps,
			fakeJob<DbUserImportJobData>({ user: { id: follower.id }, fileId, withReplies: false }),
		);

		const waiting = await runtime.dbQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(
			(j) => j.name === 'importFollowingToDb' && (j.data as DbUserImportToDbJobData).user.id === follower.id,
		);
		expect(enqueued).toBeDefined();
		expect((enqueued!.data as DbUserImportToDbJobData).target).toContain(followee.username);
	});

	test('handleQueueImportFollowingToDb: ローカルユーザーへのfollowジョブをrelationshipQueueに積む', async () => {
		const follower = await createTestUser('honoqueueimpfollowdbme');
		const followee = await createTestUser('honoqueueimpfollowdbtarget');

		// following import の行は `acct,withReplies=true` の2カラムで、withReplies は index 1 にある。
		// 処理では job.data.withReplies (ジョブ全体で1つ) のみを使うため、行ごとの指定は反映されない。
		await handleQueueImportFollowingToDb(
			deps,
			fakeJob<DbUserImportToDbJobData>({
				user: { id: follower.id },
				target: `${followee.username}@${runtime.config.runtime.host},withReplies=true`,
				withReplies: false,
			}),
		);

		const waiting = await runtime.relationshipQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(
			(j) => j.name === 'follow' && j.data.from.id === follower.id && j.data.to.id === followee.id,
		);
		expect(enqueued).toBeDefined();
		expect(enqueued!.data.silent).toBe(true);
		expect(enqueued!.data.withReplies).toBe(false);
	});

	test('handleQueueImportFollowingToDb: 自分自身はスキップされジョブを積まない', async () => {
		const follower = await createTestUser('honoqueueimpfollowdbself');

		await handleQueueImportFollowingToDb(
			deps,
			fakeJob<DbUserImportToDbJobData>({
				user: { id: follower.id },
				target: `${follower.username}@${runtime.config.runtime.host}`,
				withReplies: false,
			}),
		);

		const waiting = await runtime.relationshipQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(
			(j) => j.name === 'follow' && j.data.from.id === follower.id && j.data.to.id === follower.id,
		);
		expect(enqueued).toBeUndefined();
	});
});
