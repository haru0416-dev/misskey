/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import {
	webhookTestDummyUser1,
	webhookTestDummyUser2,
	webhookTestDummyUser3,
} from '@/core/webhook/webhook-test-dummies.js';
import type { UserWebhookDeliverQueue } from '@/core/queue/queues.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import type { WebhookTestDependencies } from '@/server/rest/webhook/webhooks.js';

const { fetchWebhookMock } = vi.hoisted(() => ({
	fetchWebhookMock: vi.fn(),
}));

vi.mock('@/core/webhook/webhook-store.js', () => ({
	fetchWebhookByIdAndUserIdFromDatabase: fetchWebhookMock,
}));

vi.mock('@/core/note/note-packing.js', () => ({
	populateEmojis: vi.fn().mockResolvedValue({}),
}));

import { handleApiIWebhooksTest } from '@/server/rest/webhook/webhooks.js';

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

	const enqueue = async (type: string, override?: { url?: string; secret?: string }) => {
		const add = vi.fn().mockResolvedValue(undefined);
		const deps = {
			config,
			db: {} as MiDrizzleDatabase,
			userWebhookDeliverQueue: { add } as unknown as UserWebhookDeliverQueue,
		} as WebhookTestDependencies;

		await handleApiIWebhooksTest(deps, me, { webhookId: webhook.id, type, ...(override ? { override } : {}) });

		expect(add).toHaveBeenCalledOnce();
		const [jobName, data, options] = add.mock.calls[0]!;
		expect(jobName).toBe(webhook.id);
		expect(options).toEqual(expect.objectContaining({ attempts: 1, backoff: { type: 'custom' } }));
		return data;
	};

	// 受け手は種別ごとに content の形を読み分けるので、種別ごとに主要な欄が対応する見本になっていることを見る。
	test.each([
		{
			type: 'note',
			content: { note: expect.objectContaining({ id: 'dummy-note-1', replyId: null, renoteId: null }) },
		},
		{
			type: 'reply',
			content: {
				note: expect.objectContaining({
					id: 'dummy-reply-1',
					replyId: 'dummy-note-1',
					reply: expect.objectContaining({ id: 'dummy-note-1' }),
				}),
			},
		},
		{
			type: 'renote',
			content: {
				note: expect.objectContaining({
					id: 'dummy-renote-1',
					userId: webhookTestDummyUser2.id,
					renoteId: 'dummy-note-1',
					renote: expect.objectContaining({ id: 'dummy-note-1' }),
				}),
			},
		},
		{
			type: 'mention',
			content: {
				note: expect.objectContaining({ id: 'dummy-mention-1', mentions: [webhookTestDummyUser2.id] }),
			},
		},
		{
			type: 'follow',
			content: {
				user: expect.objectContaining({ id: webhookTestDummyUser1.id, followersCount: expect.any(Number) }),
			},
		},
		{
			type: 'followed',
			content: { user: expect.objectContaining({ id: webhookTestDummyUser2.id }) },
		},
		{
			type: 'unfollow',
			content: {
				user: expect.objectContaining({ id: webhookTestDummyUser3.id, followersCount: expect.any(Number) }),
			},
		},
		{
			type: 'reaction',
			content: {
				note: expect.objectContaining({ id: 'dummy-note-1', userId: webhookTestDummyUser1.id }),
				reaction: '👍',
				user: expect.objectContaining({ id: webhookTestDummyUser2.id, username: webhookTestDummyUser2.username }),
			},
		},
	])('enqueues a $type job whose content matches the event type', async ({ type, content }) => {
		const data = await enqueue(type);

		expect(data).toStrictEqual({
			type,
			webhookId: webhook.id,
			userId: me.id,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: expect.any(Number),
			eventId: expect.any(String),
			content,
		});
	});

	// followed は相手の詳細を知らせない種別なので、詳細の欄を含めない。
	test('sends only the lite user for followed', async () => {
		const data = await enqueue('followed');

		expect(data.content.user).not.toHaveProperty('followersCount');
	});

	test('sends to the overridden url and secret', async () => {
		const data = await enqueue('note', { url: 'https://override.example/hook', secret: 'override-secret' });

		expect(data.to).toBe('https://override.example/hook');
		expect(data.secret).toBe('override-secret');
		expect(data.webhookId).toBe(webhook.id);
	});

	test('rejects when queue insertion rejects', async () => {
		const queueError = new Error('queue unavailable');
		const deps = {
			config,
			db: {} as MiDrizzleDatabase,
			userWebhookDeliverQueue: {
				add: vi.fn().mockRejectedValue(queueError),
			} as unknown as UserWebhookDeliverQueue,
		} as WebhookTestDependencies;

		await expect(handleApiIWebhooksTest(deps, me, { webhookId: webhook.id, type: 'note' })).rejects.toBe(queueError);
	});
});
