/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, afterAll, beforeEach, afterEach, test, expect, describe, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { WebhookTestService } from '@/core/WebhookTestService.js';
import { UserWebhookPayload, UserWebhookService } from '@/core/UserWebhookService.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook } from '@/models/Webhook.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { user, type UserInsert } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createUserProfileInDatabase } from '@/core/UserProfileStore.js';

describe('WebhookTestService', () => {
	let pool: MiDrizzlePool;
	let service: WebhookTestService;

	// --------------------------------------------------------------------------------------

	let db: MiDrizzleDatabase;
	let queueService: Mocked<QueueService>;
	let userWebhookService: Mocked<UserWebhookService>;
	let systemWebhookService: Mocked<SystemWebhookService>;
	let idService: IdService;

	let root: MiUser;
	let alice: MiUser;

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

	// --------------------------------------------------------------------------------------

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);

		idService = new IdService(config);

		const customEmojiService = {
			populateEmojis: vi.fn(),
		} as unknown as Mocked<CustomEmojiService>;
		queueService = {
			systemWebhookDeliver: vi.fn(),
			userWebhookDeliver: vi.fn(),
		} as unknown as Mocked<QueueService>;
		userWebhookService = {
			fetchWebhooks: vi.fn(),
		} as unknown as Mocked<UserWebhookService>;
		systemWebhookService = {
			fetchSystemWebhooks: vi.fn(),
		} as unknown as Mocked<SystemWebhookService>;

		service = new WebhookTestService(
			customEmojiService,
			userWebhookService,
			systemWebhookService,
			queueService,
		);
	});

	beforeEach(async () => {
		root = await createUser({ username: 'root', usernameLower: 'root' });
		alice = await createUser({ username: 'alice', usernameLower: 'alice' });

		userWebhookService.fetchWebhooks.mockReturnValue(Promise.resolve([
			{ id: 'dummy-webhook', active: true, userId: alice.id } as MiWebhook,
		]));
		systemWebhookService.fetchSystemWebhooks.mockReturnValue(Promise.resolve([
			{ id: 'dummy-webhook', isActive: true } as MiSystemWebhook,
		]));
	});

	afterEach(async () => {
		queueService.systemWebhookDeliver.mockClear();
		queueService.userWebhookDeliver.mockClear();
		userWebhookService.fetchWebhooks.mockClear();
		systemWebhookService.fetchSystemWebhooks.mockClear();

		await db.delete(userProfile);
		await db.delete(user);
	});

	afterAll(async () => {
		await pool.end();
	});

	// --------------------------------------------------------------------------------------

	describe('testUserWebhook', () => {
		test('note', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'note' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('note');
			expect((calls[2] as UserWebhookPayload<'note'>).note.id).toBe('dummy-note-1');
		});

		test('reply', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'reply' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('reply');
			expect((calls[2] as UserWebhookPayload<'reply'>).note.id).toBe('dummy-reply-1');
		});

		test('renote', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'renote' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('renote');
			expect((calls[2] as UserWebhookPayload<'renote'>).note.id).toBe('dummy-renote-1');
		});

		test('mention', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'mention' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('mention');
			expect((calls[2] as UserWebhookPayload<'mention'>).note.id).toBe('dummy-mention-1');
		});

		test('follow', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'follow' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('follow');
			expect((calls[2] as UserWebhookPayload<'follow'>).user.id).toBe('dummy-user-1');
		});

		test('followed', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'followed' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('followed');
			expect((calls[2] as UserWebhookPayload<'followed'>).user.id).toBe('dummy-user-2');
		});

		test('unfollow', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'unfollow' }, alice);

			const calls = queueService.userWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('unfollow');
			expect((calls[2] as UserWebhookPayload<'unfollow'>).user.id).toBe('dummy-user-3');
		});

		describe('NoSuchWebhookError', () => {
			test('user not match', async () => {
				userWebhookService.fetchWebhooks.mockClear();
				userWebhookService.fetchWebhooks.mockReturnValue(Promise.resolve([
					{ id: 'dummy-webhook', active: true } as MiWebhook,
				]));

				await expect(service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'note' }, root))
					.rejects.toThrow(WebhookTestService.NoSuchWebhookError);
			});
		});
	});

	describe('testSystemWebhook', () => {
		test('abuseReport', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'abuseReport' });

			const calls = queueService.systemWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('abuseReport');
			expect((calls[2] as any).id).toBe('dummy-abuse-report1');
			expect((calls[2] as any).resolved).toBe(false);
		});

		test('abuseReportResolved', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'abuseReportResolved' });

			const calls = queueService.systemWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('abuseReportResolved');
			expect((calls[2] as any).id).toBe('dummy-abuse-report1');
			expect((calls[2] as any).resolved).toBe(true);
		});

		test('userCreated', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'userCreated' });

			const calls = queueService.systemWebhookDeliver.mock.calls[0];
			expect((calls[0] as any).id).toBe('dummy-webhook');
			expect(calls[1]).toBe('userCreated');
			expect((calls[2] as any).id).toBe('dummy-user-1');
		});
	});
});
