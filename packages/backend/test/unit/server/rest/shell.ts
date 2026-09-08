/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { muting } from '@/db/schema/muting.js';
import { note } from '@/db/schema/note.js';
import { countDatabaseQueries } from '../../../query-counter.js';
import { createApiShellApp } from '@/server/rest/shell.js';

function expectApiHeaders(response: Response): void {
	expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	expect(response.headers.get('Cache-Control')).toBe('private, max-age=0, must-revalidate');
}

describe('API shell headers', () => {
	const app = createApiShellApp({} as never);

	test('sets API headers on JSON responses', async () => {
		const response = await app.request('/ping', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});

		expect(response.status).toBe(200);
		expectApiHeaders(response);
	});

	test('sets API headers on preflight responses', async () => {
		const response = await app.request('/ping', {
			method: 'OPTIONS',
			headers: { 'Access-Control-Request-Headers': 'authorization, content-type' },
		});

		expect(response.status).toBe(204);
		expectApiHeaders(response);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,HEAD,POST,OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('authorization, content-type');
	});

	test('sets API headers on utility responses', async () => {
		const response = await app.request('/clear-browser-cache', { method: 'POST' });

		expect(response.status).toBe(204);
		expectApiHeaders(response);
		expect(response.headers.get('Clear-Site-Data')).toContain('cache');
	});

	test('sets API headers on unknown endpoint responses', async () => {
		const response = await app.request('/does-not-exist', { method: 'POST' });

		expect(response.status).toBe(404);
		expectApiHeaders(response);
	});
});

describe('通知一覧のユーザー取得', () => {
	let runtime: RuntimeDependencies;
	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});
	afterAll(async () => {
		await runtime.dispose();
	});

	test('取得済みの通知元を再利用し、ミュート・凍結・欠損の除外とグループ内の順序を維持する', async () => {
		const token = generateNativeUserToken();
		const viewerId = genId();
		await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: viewerId, username: `viewer${viewerId}`, usernameLower: `viewer${viewerId}`, token },
			profile: { userId: viewerId, mutedInstances: ['muted.example'] },
		});
		const users = await Promise.all(
			Array.from({ length: 4 }, async (_, index) => {
				const id = genId();
				return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
					user: {
						id,
						username: `notifier${id}`,
						usernameLower: `notifier${id}`,
						isSuspended: index === 2,
						host: index === 3 ? 'muted.example' : null,
					},
					profile: { userId: id },
				});
			}),
		);
		await runtime.db.insert(muting).values({ id: genId(), muterId: viewerId, muteeId: users[1]!.id });
		const app = createApiShellApp({
			...runtime,
			dbPool: runtime.drizzlePool,
			logger: runtime.loggerService.getLogger('test-notifications'),
		});
		const stream = `notificationTimeline:${viewerId}`;
		const request = async (path: string) => {
			const response = await app.request(path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ i: token, markAsRead: false }),
			});
			expect(response.status).toBe(200);
			return (await response.json()) as {
				id: string;
				type: string;
				user: { id: string };
				reactions: { user: { id: string }; reaction: string }[];
			}[];
		};
		try {
			const sourceIds = [users[0]!.id, users[1]!.id, users[2]!.id, users[3]!.id, genId(), users[0]!.id];
			const entries = sourceIds.map((notifierId) => ({
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'follow',
				notifierId,
			}));
			for (const entry of entries) await runtime.redis.xadd(stream, '*', 'data', JSON.stringify(entry));
			await request('/i/notifications');
			const counter = countDatabaseQueries(runtime.db);
			try {
				const packed = await request('/i/notifications');
				expect(packed.map((entry: { id: string }) => entry.id)).toEqual([entries[5]!.id, entries[0]!.id]);
				expect(packed.every((entry: { user: { id: string } }) => entry.user.id === users[0]!.id)).toBe(true);
				expect(counter.count()).toBe(4);
			} finally {
				counter.restore();
			}
			await runtime.redis.del(stream);
			const noteId = genId();
			await runtime.db.insert(note).values({ id: noteId, userId: viewerId, visibility: 'public', text: '通知対象' });
			for (const [index, notifierId] of [users[0]!.id, viewerId, users[0]!.id].entries()) {
				await runtime.redis.xadd(
					stream,
					'*',
					'data',
					JSON.stringify({
						id: genId(),
						createdAt: new Date().toISOString(),
						type: 'reaction',
						notifierId,
						noteId,
						reaction: ['👍', '❤', '😅'][index],
					}),
				);
			}
			const grouped = await request('/i/notifications-grouped');
			expect(grouped).toHaveLength(1);
			expect(grouped[0]!.type).toBe('reaction:grouped');
			expect(
				grouped[0]!.reactions.map((entry: { user: { id: string }; reaction: string }) => [
					entry.user.id,
					entry.reaction,
				]),
			).toEqual([
				[users[0]!.id, '😅'],
				[viewerId, '❤'],
				[users[0]!.id, '👍'],
			]);
		} finally {
			await runtime.redis.del(stream);
		}
	});
});
