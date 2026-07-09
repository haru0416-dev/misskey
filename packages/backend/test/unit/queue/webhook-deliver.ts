/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createHttpRequestService } from '@/core/HttpRequestService.js';
import { createWebhookInDatabase, fetchWebhookByIdAndUserIdFromDatabase } from '@/core/WebhookStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createSystemWebhookInDatabase, fetchSystemWebhookByIdOrFailFromDatabase } from '@/core/SystemWebhookStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueSystemWebhookDeliver, handleHonoQueueUserWebhookDeliver } from '@/queue/handlers/webhook-deliver.js';
import type { SystemWebhookDeliverJobData, UserWebhookDeliverJobData } from '@/queue/types.js';

function fakeJob<T>(data: T): Bull.Job<T> {
	return { data } as Bull.Job<T>;
}

describe('hono-queue-webhook-deliver', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	const config = loadConfig();
	const httpRequestService = createHttpRequestService(config);

	beforeAll(() => {
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.end();
	});

	test('handleHonoQueueUserWebhookDeliver は成功時にlatestSentAt/latestStatusを更新する', async () => {
		let received: { headers: Record<string, string | string[] | undefined>; body: string } | undefined;
		const server: Server = createServer((req, res) => {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				received = { headers: req.headers, body };
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end('{}');
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});

		try {
			const address = server.address() as AddressInfo;
			const to = `http://127.0.0.1:${address.port}/webhook`;

			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuetest${userId}`,
				usernameLower: `honoqueuetest${userId}`.toLowerCase(),
			});
			const webhook = await createWebhookInDatabase(db, {
				id: genId(),
				userId,
				name: 'test webhook',
				url: to,
				secret: 'test-secret',
				on: ['note'],
			});

			const data: UserWebhookDeliverJobData = {
				type: 'note',
				content: { note: { id: 'dummy' } } as UserWebhookDeliverJobData['content'],
				webhookId: webhook.id,
				userId,
				to,
				secret: webhook.secret,
				createdAt: Date.now(),
				eventId: genId(),
			};

			const result = await handleHonoQueueUserWebhookDeliver({ config, db, httpRequestService }, fakeJob(data));
			expect(result).toBe('Success');

			expect(received?.headers['x-misskey-hook-id']).toBe(webhook.id);
			expect(received?.headers['x-misskey-hook-secret']).toBe('test-secret');
			const sentBody = JSON.parse(received!.body);
			expect(sentBody.hookId).toBe(webhook.id);
			expect(sentBody.userId).toBe(userId);
			expect(sentBody.type).toBe('note');

			const updated = await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, userId);
			expect(updated!.latestStatus).toBe(200);
			expect(updated!.latestSentAt).not.toBeNull();
		} finally {
			server.close();
		}
	});

	test('handleHonoQueueSystemWebhookDeliver は成功時にlatestSentAt/latestStatusを更新する', async () => {
		let received: { headers: Record<string, string | string[] | undefined>; body: string } | undefined;
		const server: Server = createServer((req, res) => {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				received = { headers: req.headers, body };
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end('{}');
			});
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});

		try {
			const address = server.address() as AddressInfo;
			const to = `http://127.0.0.1:${address.port}/webhook`;

			const webhook = await createSystemWebhookInDatabase(db, {
				id: genId(),
				name: 'test system webhook',
				url: to,
				secret: 'test-system-secret',
				on: ['abuseReport'],
			});

			const data: SystemWebhookDeliverJobData = {
				type: 'abuseReport',
				content: { reportId: 'dummy' } as unknown as SystemWebhookDeliverJobData['content'],
				webhookId: webhook.id,
				to,
				secret: webhook.secret,
				createdAt: Date.now(),
				eventId: genId(),
			};

			const result = await handleHonoQueueSystemWebhookDeliver({ config, db, httpRequestService }, fakeJob(data));
			expect(result).toBe('Success');

			expect(received?.headers['x-misskey-hook-id']).toBe(webhook.id);
			const sentBody = JSON.parse(received!.body);
			expect(sentBody.hookId).toBe(webhook.id);
			expect(sentBody.userId).toBeUndefined();
			expect(sentBody.type).toBe('abuseReport');

			const updated = await fetchSystemWebhookByIdOrFailFromDatabase(db, webhook.id);
			expect(updated!.latestStatus).toBe(200);
			expect(updated!.latestSentAt).not.toBeNull();
		} finally {
			server.close();
		}
	});

	test('handleHonoQueueUserWebhookDeliver は4xxでUnrecoverableErrorを投げる', async () => {
		const server: Server = createServer((_req, res) => {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end('{}');
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});

		try {
			const address = server.address() as AddressInfo;
			const to = `http://127.0.0.1:${address.port}/webhook`;

			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuetest${userId}`,
				usernameLower: `honoqueuetest${userId}`.toLowerCase(),
			});
			const webhook = await createWebhookInDatabase(db, {
				id: genId(),
				userId,
				name: 'test webhook 4xx',
				url: to,
				secret: 'test-secret',
				on: ['note'],
			});

			const data: UserWebhookDeliverJobData = {
				type: 'note',
				content: { note: { id: 'dummy' } } as UserWebhookDeliverJobData['content'],
				webhookId: webhook.id,
				userId,
				to,
				secret: webhook.secret,
				createdAt: Date.now(),
				eventId: genId(),
			};

			await expect(handleHonoQueueUserWebhookDeliver({ config, db, httpRequestService }, fakeJob(data)))
				.rejects.toThrow(Bull.UnrecoverableError);

			const updated = await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, userId);
			expect(updated!.latestStatus).toBe(400);
		} finally {
			server.close();
		}
	});
});
