/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { UserWebhookDeliverQueue } from '@/core/queue/queues.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiWebhookTestDependencies } from '@/server/rest/webhooks.js';

const { fetchWebhookMock } = vi.hoisted(() => ({
	fetchWebhookMock: vi.fn(),
}));

vi.mock('@/core/webhook/WebhookStore.js', () => ({
	fetchWebhookByIdAndUserIdFromDatabase: fetchWebhookMock,
}));

vi.mock('@/server/rest/note.js', () => ({
	populateEmojis: vi.fn().mockResolvedValue({}),
}));

import { handleHonoApiIWebhooksTest } from '@/server/rest/webhooks.js';

describe('i/webhooks/test REST handler', () => {
	const me = { id: 'webhook-owner' } as MiLocalUser;
	const webhook = {
		id: '9wgo5w7lv6',
		userId: me.id,
		name: 'test',
		on: ['reaction'],
		url: 'https://example.com/webhook',
		secret: 'secret',
		active: true,
		latestSentAt: null,
		latestStatus: null,
		user: null,
	};
	const config = {
		queues: {
			retention: {
				completedMaximumAgeSeconds: 3600,
				completedMaximumCount: 100,
				failedMaximumAgeSeconds: 3600,
				failedMaximumCount: 100,
			},
		},
	} as Config;

	beforeEach(() => {
		vi.clearAllMocks();
		fetchWebhookMock.mockResolvedValue(webhook);
	});

	test('enqueues a representative reaction job', async () => {
		const add = vi.fn().mockResolvedValue(undefined);
		const deps = {
			config,
			db: {} as MiDrizzleDatabase,
			userWebhookDeliverQueue: { add } as unknown as UserWebhookDeliverQueue,
		} as HonoApiWebhookTestDependencies;

		await handleHonoApiIWebhooksTest(deps, me, { webhookId: webhook.id, type: 'reaction' });

		expect(add).toHaveBeenCalledOnce();
		expect(add).toHaveBeenCalledWith(
			webhook.id,
			expect.objectContaining({
				type: 'reaction',
				webhookId: webhook.id,
				userId: me.id,
				to: webhook.url,
				secret: webhook.secret,
				createdAt: expect.any(Number),
				eventId: expect.any(String),
				content: {
					note: expect.objectContaining({ id: 'dummy-note-1', userId: 'dummy-user-1' }),
					reaction: '👍',
					user: expect.objectContaining({ id: 'dummy-user-2', username: 'dummy2' }),
				},
			}),
			expect.objectContaining({ attempts: 1, backoff: { type: 'custom' } }),
		);
	});

	test('rejects when queue insertion rejects', async () => {
		const queueError = new Error('queue unavailable');
		const deps = {
			config,
			db: {} as MiDrizzleDatabase,
			userWebhookDeliverQueue: {
				add: vi.fn().mockRejectedValue(queueError),
			} as unknown as UserWebhookDeliverQueue,
		} as HonoApiWebhookTestDependencies;

		await expect(handleHonoApiIWebhooksTest(deps, me, { webhookId: webhook.id, type: 'note' })).rejects.toBe(
			queueError,
		);
	});
});
