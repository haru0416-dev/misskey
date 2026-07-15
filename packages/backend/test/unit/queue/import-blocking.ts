/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
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
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueImportBlocking, handleHonoQueueImportBlockingToDb, type HonoQueueDbDependencies } from '@/queue/handlers/db.js';
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

describe('hono-queue-db (importBlocking)', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDbDependencies;
	let servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-import-blocking') };
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

	test('handleHonoQueueImportBlocking: CSVの行ごとにimportBlockingToDbジョブを積む', async () => {
		const blocker = await createTestUser('honoqueueimpblockme');
		const target = await createTestUser('honoqueueimpblocktarget');

		const { url, server } = await serveText(`${target.username}@${runtime.config.runtime.host}\n`);
		servers.push(server);

		const fileId = genId();
		await createDriveFileInDatabase(runtime.db, {
			id: fileId,
			md5: 'dummy',
			name: 'blocking.csv',
			type: 'text/csv',
			size: url.length,
			storedInternal: false,
			url,
			userId: blocker.id,
			userHost: null,
		});

		await handleHonoQueueImportBlocking(deps, fakeJob<DbUserImportJobData>({ user: { id: blocker.id }, fileId }));

		const waiting = await runtime.dbQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(j => j.name === 'importBlockingToDb' && (j.data as DbUserImportToDbJobData).user.id === blocker.id);
		expect(enqueued).toBeDefined();
		expect((enqueued!.data as DbUserImportToDbJobData).target).toContain(target.username);
	});

	test('handleHonoQueueImportBlockingToDb: ローカルユーザーへのblockジョブをrelationshipQueueに積む', async () => {
		const blocker = await createTestUser('honoqueueimpblockdbme');
		const target = await createTestUser('honoqueueimpblockdbtarget');

		await handleHonoQueueImportBlockingToDb(deps, fakeJob<DbUserImportToDbJobData>({
			user: { id: blocker.id },
			target: `${target.username}@${runtime.config.runtime.host}`,
		}));

		const waiting = await runtime.relationshipQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(j => j.name === 'block' && j.data.from.id === blocker.id && j.data.to.id === target.id);
		expect(enqueued).toBeDefined();
		expect(enqueued!.data.silent).toBe(true);
	});

	test('handleHonoQueueImportBlockingToDb: 自分自身はスキップされジョブを積まない', async () => {
		const blocker = await createTestUser('honoqueueimpblockdbself');

		await handleHonoQueueImportBlockingToDb(deps, fakeJob<DbUserImportToDbJobData>({
			user: { id: blocker.id },
			target: `${blocker.username}@${runtime.config.runtime.host}`,
		}));

		const waiting = await runtime.relationshipQueue.getJobs(['waiting', 'delayed']);
		const enqueued = waiting.find(j => j.name === 'block' && j.data.from.id === blocker.id && j.data.to.id === blocker.id);
		expect(enqueued).toBeUndefined();
	});
});
