/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, beforeAll, afterAll, beforeEach, afterEach, test, vi } from 'vitest';
import type { Mocked } from 'vitest';
import type * as Redis from 'ioredis';
import { randomString } from '../utils.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiUser } from '@/models/User.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiAbuseReportNotificationRecipient, RecipientMethod } from '@/models/AbuseReportNotificationRecipient.js';
import { IdService } from '@/core/IdService.js';
import { EmailService } from '@/core/EmailService.js';
import { RoleService } from '@/core/RoleService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { abuseReportNotificationRecipient } from '@/db/schema/abuse-report-notification-recipient.js';
import { systemWebhook } from '@/db/schema/system-webhook.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import {
	createAbuseReportNotificationRecipientInDatabase,
	fetchAbuseReportNotificationRecipientByIdFromDatabase,
} from '@/core/AbuseReportNotificationRecipientStore.js';
import { createSystemWebhookInDatabase } from '@/core/SystemWebhookStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';

process.env.NODE_ENV = 'test';

describe('AbuseReportNotificationService', () => {
	let pool: MiDrizzlePool;
	let service: AbuseReportNotificationService;

	// --------------------------------------------------------------------------------------

	let db: MiDrizzleDatabase;
	let idService: IdService;
	let roleService: Mocked<RoleService>;
	let emailService: Mocked<EmailService>;
	let webhookService: Mocked<SystemWebhookService>;

	// --------------------------------------------------------------------------------------

	let root: MiUser;
	let alice: MiUser;
	let bob: MiUser;
	let systemWebhook1: MiSystemWebhook;
	let systemWebhook2: MiSystemWebhook;

	// --------------------------------------------------------------------------------------

	async function createUser(data: Partial<UserInsert> & Pick<UserInsert, 'username' | 'usernameLower'>) {
		const user = await createUserInDatabase(db, {
			id: idService.gen(),
			...data,
		});

		await createUserProfileInDatabase(db, {
			userId: user.id,
		});

		return user;
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

	async function createRecipient(data: Partial<MiAbuseReportNotificationRecipient> = {}) {
		return createAbuseReportNotificationRecipientInDatabase(db, {
			id: idService.gen(),
			isActive: true,
			name: randomString(),
			method: 'email',
			userId: null,
			systemWebhookId: null,
			...data,
		});
	}

	// --------------------------------------------------------------------------------------

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		idService = new IdService(config);
		roleService = { getModeratorIds: vi.fn() } as unknown as Mocked<RoleService>;
		webhookService = { enqueueSystemWebhook: vi.fn() } as unknown as Mocked<SystemWebhookService>;
		const userEntityService = {
			pack: (v: any) => Promise.resolve(v),
			packMany: (v: any) => Promise.resolve(v),
		} as unknown as UserEntityService;
		emailService = { sendEmail: vi.fn() } as unknown as Mocked<EmailService>;
		const moderationLogService = { log: () => Promise.resolve() } as unknown as ModerationLogService;
		const globalEventService = { publishAdminStream: vi.fn() } as unknown as GlobalEventService;
		const redisForSub = { on: () => {} } as unknown as Redis.Redis;
		const unused = undefined as never;

		service = new AbuseReportNotificationService(
			unused,
			db,
			redisForSub,
			idService,
			roleService,
			webhookService,
			emailService,
			moderationLogService,
			globalEventService,
			userEntityService,
		);
	});

	beforeEach(async () => {
		root = await createUser({ username: 'root', usernameLower: 'root' });
		alice = await createUser({ username: 'alice', usernameLower: 'alice' });
		bob = await createUser({ username: 'bob', usernameLower: 'bob' });
		systemWebhook1 = await createWebhook();
		systemWebhook2 = await createWebhook();

		roleService.getModeratorIds.mockResolvedValue([root.id, alice.id, bob.id]);
	});

	afterEach(async () => {
		emailService.sendEmail.mockClear();
		webhookService.enqueueSystemWebhook.mockClear();

		await db.delete(abuseReportNotificationRecipient);
		await db.delete(systemWebhook);
		await db.delete(userProfile);
		await db.delete(user);
	});

	afterAll(async () => {
		await pool.end();
	});

	// --------------------------------------------------------------------------------------

	describe('createRecipient', () => {
		test('作成成功1', async () => {
			const params = {
				isActive: true,
				name: randomString(),
				method: 'email' as RecipientMethod,
				userId: alice.id,
				systemWebhookId: null,
			};

			const recipient1 = await service.createRecipient(params, root);
			expect(recipient1).toMatchObject(params);
		});

		test('作成成功2', async () => {
			const params = {
				isActive: true,
				name: randomString(),
				method: 'webhook' as RecipientMethod,
				userId: null,
				systemWebhookId: systemWebhook1.id,
			};

			const recipient1 = await service.createRecipient(params, root);
			expect(recipient1).toMatchObject(params);
		});
	});

	describe('updateRecipient', () => {
		test('更新成功1', async () => {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});

			const params = {
				id: recipient1.id,
				isActive: false,
				name: randomString(),
				method: 'email' as RecipientMethod,
				userId: bob.id,
				systemWebhookId: null,
			};

			const recipient2 = await service.updateRecipient(params, root);
			expect(recipient2).toMatchObject(params);
		});

		test('更新成功2', async () => {
			const recipient1 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
			});

			const params = {
				id: recipient1.id,
				isActive: false,
				name: randomString(),
				method: 'webhook' as RecipientMethod,
				userId: null,
				systemWebhookId: systemWebhook2.id,
			};

			const recipient2 = await service.updateRecipient(params, root);
			expect(recipient2).toMatchObject(params);
		});
	});

	describe('deleteRecipient', () => {
		test('削除成功1', async () => {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});

			await service.deleteRecipient(recipient1.id, root);

			await expect(fetchAbuseReportNotificationRecipientByIdFromDatabase(db, recipient1.id)).resolves.toBeNull();
		});
	});

	describe('fetchRecipients', () => {
		async function create() {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});
			const recipient2 = await createRecipient({
				method: 'email',
				userId: bob.id,
			});

			const recipient3 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
			});
			const recipient4 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook2.id,
			});

			return [recipient1, recipient2, recipient3, recipient4];
		}

		test('フィルタなし', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({});
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('フィルタなし(非モデレータは除外される)', async () => {
			roleService.getModeratorIds.mockClear();
			roleService.getModeratorIds.mockResolvedValue([root.id, bob.id]);

			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({});
			// aliceはモデレータではないので除外される
			expect(recipients).toEqual([recipient2, recipient3, recipient4]);
		});

		test('フィルタなし(非モデレータでも除外されないオプション設定)', async () => {
			roleService.getModeratorIds.mockClear();
			roleService.getModeratorIds.mockResolvedValue([root.id, bob.id]);

			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({}, { removeUnauthorized: false });
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('emailのみ', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['email'] });
			expect(recipients).toEqual([recipient1, recipient2]);
		});

		test('webhookのみ', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['webhook'] });
			expect(recipients).toEqual([recipient3, recipient4]);
		});

		test('すべて', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['email', 'webhook'] });
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('ID指定', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id] });
			expect(recipients).toEqual([recipient1, recipient3]);
		});

		test('ID指定(method=emailではないIDが混ざりこまない)', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id], method: ['email'] });
			expect(recipients).toEqual([recipient1]);
		});

		test('ID指定(method=webhookではないIDが混ざりこまない)', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id], method: ['webhook'] });
			expect(recipients).toEqual([recipient3]);
		});
	});

	describe('notifySystemWebhook', () => {
		test('非アクティブな通報通知はWebhook送信から除外される', async () => {
			const recipient1 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
				isActive: true,
			});
			const recipient2 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook2.id,
				isActive: false,
			});

			const reports: MiAbuseUserReport[] = [
				{
					id: idService.gen(),
					targetUserId: alice.id,
					targetUser: alice,
					reporterId: bob.id,
					reporter: bob,
					assigneeId: null,
					assignee: null,
					resolved: false,
					forwarded: false,
					comment: 'test',
					moderationNote: '',
					resolvedAs: null,
					targetUserHost: null,
					reporterHost: null,
				},
			];

			await service.notifySystemWebhook(reports, 'abuseReport');

			// 実際に除外されるかはSystemWebhookService側で確認する.
			// ここでは非アクティブな通報通知を除外設定できているかを確認する
			expect(webhookService.enqueueSystemWebhook).toHaveBeenCalledTimes(1);
			expect(webhookService.enqueueSystemWebhook.mock.calls[0][0]).toBe('abuseReport');
			expect(webhookService.enqueueSystemWebhook.mock.calls[0][2]).toEqual({ excludes: [systemWebhook2.id] });
		});
	});
});
