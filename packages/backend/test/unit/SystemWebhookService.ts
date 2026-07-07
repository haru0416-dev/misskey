/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { afterEach, beforeEach, afterAll, beforeAll, describe, test, expect, vi } from 'vitest';
import type { Mocked } from 'vitest';
import type * as Redis from 'ioredis';
import { randomString } from '../utils.js';
import type { MiUser } from '@/models/User.js';
import { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { QueueService } from '@/core/QueueService.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { systemWebhook } from '@/db/schema/system-webhook.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import {
	createSystemWebhookInDatabase,
	fetchSystemWebhookByIdFromDatabase,
} from '@/core/SystemWebhookStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { createRedisForPub, createRedisForSub } from '@/runtime-dependencies.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';

describe('SystemWebhookService', () => {
	let service: SystemWebhookService;

	// --------------------------------------------------------------------------------------

	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let idService: IdService;
	let queueService: Mocked<QueueService>;
	let redisForPub: Redis.Redis;
	let redisForSub: Redis.Redis;

	// --------------------------------------------------------------------------------------

	let root: MiUser;

	// --------------------------------------------------------------------------------------

	async function createUser(data: Partial<UserInsert> & Pick<UserInsert, 'username' | 'usernameLower'>) {
		return await createUserInDatabase(db, {
			id: idService.gen(),
			...data,
		});
	}

	async function createWebhook(data: Partial<MiSystemWebhook> = {}) {
		return createSystemWebhookInDatabase(db, {
			id: idService.gen(),
			isActive: data.isActive ?? true,
			updatedAt: data.updatedAt ?? new Date(),
			latestSentAt: data.latestSentAt ?? null,
			latestStatus: data.latestStatus ?? null,
			name: randomString(),
			on: ['abuseReport'],
			url: 'https://example.com',
			secret: randomString(),
			...data,
		});
	}

	// --------------------------------------------------------------------------------------

	async function beforeAllImpl() {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		idService = new IdService(config);
		queueService = { systemWebhookDeliver: vi.fn() } as unknown as Mocked<QueueService>;
		const moderationLogService = { log: () => Promise.resolve() } as unknown as ModerationLogService;

		redisForPub = createRedisForPub(config);
		redisForSub = await createRedisForSub(config);
		const globalEventService = new GlobalEventService(config, redisForPub);

		service = new SystemWebhookService(redisForSub, db, idService, queueService, moderationLogService, globalEventService);
	}

	async function afterAllImpl() {
		service.dispose();
		redisForSub.disconnect();
		redisForPub.disconnect();
		await pool.end();
	}

	async function beforeEachImpl() {
		root = await createUser({ username: 'root', usernameLower: 'root' });
	}

	async function afterEachImpl() {
		await db.delete(systemWebhook);
		await db.delete(user);
	}

	// --------------------------------------------------------------------------------------

	describe('アプリを毎回作り直す必要のないグループ', () => {
		beforeAll(beforeAllImpl);
		afterAll(afterAllImpl);
		beforeEach(beforeEachImpl);
		afterEach(afterEachImpl);

		describe('fetchSystemWebhooks', () => {
			test('フィルタなし', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks();
				expect(fetchedWebhooks).toEqual([webhook1, webhook2, webhook3, webhook4]);
			});

			test('activeのみ', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks({ isActive: true });
				expect(fetchedWebhooks).toEqual([webhook1, webhook3]);
			});

			test('特定のイベントのみ', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks({ on: ['abuseReport'] });
				expect(fetchedWebhooks).toEqual([webhook1, webhook2]);
			});

			test('activeな特定のイベントのみ', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks({ on: ['abuseReport'], isActive: true });
				expect(fetchedWebhooks).toEqual([webhook1]);
			});

			test('ID指定', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks({ ids: [webhook1.id, webhook4.id] });
				expect(fetchedWebhooks).toEqual([webhook1, webhook4]);
			});

			test('ID指定(他条件とANDになるか見たい)', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook3 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: [],
				});

				const fetchedWebhooks = await service.fetchSystemWebhooks({ ids: [webhook1.id, webhook4.id], isActive: false });
				expect(fetchedWebhooks).toEqual([webhook4]);
			});
		});

		describe('createSystemWebhook', () => {
			test('作成成功	', async () => {
				const params = {
					isActive: true,
					name: randomString(),
					on: ['abuseReport'] as SystemWebhookEventType[],
					url: 'https://example.com',
					secret: randomString(),
				};

				const webhook = await service.createSystemWebhook(params, root);
				expect(webhook).toMatchObject(params);
			});
		});

		describe('updateSystemWebhook', () => {
			test('更新成功', async () => {
				const webhook = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});

				const params = {
					id: webhook.id,
					isActive: false,
					name: randomString(),
					on: ['abuseReport'] as SystemWebhookEventType[],
					url: randomString(),
					secret: randomString(),
				};

				const updatedWebhook = await service.updateSystemWebhook(params, root);
				expect(updatedWebhook).toMatchObject(params);
			});
		});

		describe('deleteSystemWebhook', () => {
			test('削除成功', async () => {
				const webhook = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});

				await service.deleteSystemWebhook(webhook.id, root);

				await expect(fetchSystemWebhookByIdFromDatabase(db, webhook.id)).resolves.toBeNull();
			});
		});
	});

	describe('アプリを毎回作り直す必要があるグループ', () => {
		beforeEach(async () => {
			await beforeAllImpl();
			await beforeEachImpl();
		});

		afterEach(async () => {
			await afterEachImpl();
			await afterAllImpl();
		});

		describe('enqueueSystemWebhook', () => {
			test('キューに追加成功', async () => {
				const webhook = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				await service.enqueueSystemWebhook('abuseReport', { foo: 'bar' } as any);

				expect(queueService.systemWebhookDeliver).toHaveBeenCalledTimes(1);
				expect(queueService.systemWebhookDeliver.mock.calls[0][0] as MiSystemWebhook).toEqual(webhook);
			});

			test('非アクティブなWebhookはキューに追加されない', async () => {
				const webhook = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				await service.enqueueSystemWebhook('abuseReport', { foo: 'bar' } as any);

				expect(queueService.systemWebhookDeliver).not.toHaveBeenCalled();
			});

			test('未許可のイベント種別が渡された場合はWebhookはキューに追加されない', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: [],
				});
				const webhook2 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				await service.enqueueSystemWebhook('abuseReport', { foo: 'bar' } as any);

				expect(queueService.systemWebhookDeliver).not.toHaveBeenCalled();
			});

			test('混在した時、有効かつ許可されたイベント種別のみ', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: true,
					on: ['abuseReportResolved'],
				});
				const webhook3 = await createWebhook({
					isActive: false,
					on: ['abuseReport'],
				});
				const webhook4 = await createWebhook({
					isActive: false,
					on: ['abuseReportResolved'],
				});
				await service.enqueueSystemWebhook('abuseReport', { foo: 'bar' } as any);

				expect(queueService.systemWebhookDeliver).toHaveBeenCalledTimes(1);
				expect(queueService.systemWebhookDeliver.mock.calls[0][0] as MiSystemWebhook).toEqual(webhook1);
			});

			test('除外指定した場合は送信されない', async () => {
				const webhook1 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});
				const webhook2 = await createWebhook({
					isActive: true,
					on: ['abuseReport'],
				});

				await service.enqueueSystemWebhook('abuseReport', { foo: 'bar' } as any, { excludes: [webhook2.id] });

				expect(queueService.systemWebhookDeliver).toHaveBeenCalledTimes(1);
				expect(queueService.systemWebhookDeliver.mock.calls[0][0] as MiSystemWebhook).toEqual(webhook1);
			});
		});

		describe('fetchActiveSystemWebhooks', () => {
			describe('systemWebhookCreated', () => {
				test('ActiveなWebhookが追加された時、キャッシュに追加されている', async () => {
					const webhook = await service.createSystemWebhook(
						{
							isActive: true,
							name: randomString(),
							on: ['abuseReport'],
							url: 'https://example.com',
							secret: randomString(),
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks).toEqual([webhook]);
				});

				test('NotActiveなWebhookが追加された時、キャッシュに追加されていない', async () => {
					const webhook = await service.createSystemWebhook(
						{
							isActive: false,
							name: randomString(),
							on: ['abuseReport'],
							url: 'https://example.com',
							secret: randomString(),
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks).toEqual([]);
				});
			});

			describe('systemWebhookUpdated', () => {
				test('ActiveなWebhookが編集された時、キャッシュに反映されている', async () => {
					const id = idService.gen();
					await createWebhook({ id });
					// キャッシュ作成
					const webhook1 = await service.fetchActiveSystemWebhooks();
					// 読み込まれていることをチェック
					expect(webhook1.length).toEqual(1);
					expect(webhook1[0].id).toEqual(id);

					const webhook2 = await service.updateSystemWebhook(
						{
							id,
							isActive: true,
							name: randomString(),
							on: ['abuseReport'],
							url: 'https://example.com',
							secret: randomString(),
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks).toEqual([webhook2]);
				});

				test('NotActiveなWebhookが編集された時、キャッシュに追加されない', async () => {
					const id = idService.gen();
					await createWebhook({ id, isActive: false });
					// キャッシュ作成
					const webhook1 = await service.fetchActiveSystemWebhooks();
					// 読み込まれていないことをチェック
					expect(webhook1.length).toEqual(0);

					const webhook2 = await service.updateSystemWebhook(
						{
							id,
							isActive: false,
							name: randomString(),
							on: ['abuseReport'],
							url: 'https://example.com',
							secret: randomString(),
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks.length).toEqual(0);
				});

				test('NotActiveなWebhookがActiveにされた時、キャッシュに追加されている', async () => {
					const id = idService.gen();
					const baseWebhook = await createWebhook({ id, isActive: false });
					// キャッシュ作成
					const webhook1 = await service.fetchActiveSystemWebhooks();
					// 読み込まれていないことをチェック
					expect(webhook1.length).toEqual(0);

					const webhook2 = await service.updateSystemWebhook(
						{
							...baseWebhook,
							isActive: true,
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks).toEqual([webhook2]);
				});

				test('ActiveなWebhookがNotActiveにされた時、キャッシュから削除されている', async () => {
					const id = idService.gen();
					const baseWebhook = await createWebhook({ id, isActive: true });
					// キャッシュ作成
					const webhook1 = await service.fetchActiveSystemWebhooks();
					// 読み込まれていることをチェック
					expect(webhook1.length).toEqual(1);
					expect(webhook1[0].id).toEqual(id);

					const webhook2 = await service.updateSystemWebhook(
						{
							...baseWebhook,
							isActive: false,
						},
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks.length).toEqual(0);
				});
			});

			describe('systemWebhookDeleted', () => {
				test('キャッシュから削除されている', async () => {
					const id = idService.gen();
					const baseWebhook = await createWebhook({ id, isActive: true });
					// キャッシュ作成
					const webhook1 = await service.fetchActiveSystemWebhooks();
					// 読み込まれていることをチェック
					expect(webhook1.length).toEqual(1);
					expect(webhook1[0].id).toEqual(id);

					const webhook2 = await service.deleteSystemWebhook(
						id,
						root,
					);

					// redisでの配信経由で更新されるのでちょっと待つ
					await setTimeout(500);

					const fetchedWebhooks = await service.fetchActiveSystemWebhooks();
					expect(fetchedWebhooks.length).toEqual(0);
				});
			});
		});
	});
});
