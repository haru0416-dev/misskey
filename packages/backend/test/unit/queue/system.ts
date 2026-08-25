/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { recordUserIpInDatabase, listUserIpsFromDatabase } from '@/core/UserIpStore.js';
import { createAntennaInDatabase, fetchAntennaByIdFromDatabase } from '@/core/AntennaStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { createRoleAssignmentInDatabase, listRoleAssignmentsByUserIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import {
	createRetentionAggregationInDatabase,
	listRetentionAggregationsCreatedAfter,
} from '@/core/RetentionAggregationStore.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { createMutingInDatabase, mutingExistsInDatabase } from '@/core/MutingStore.js';
import { createChannelInDatabase } from '@/core/ChannelStore.js';
import {
	createChannelMutingInDatabase,
	listActiveMutedChannelIdsByUserIdFromDatabase,
} from '@/core/ChannelMutingStore.js';
import { createNoteInDatabase, fetchNoteByIdOrFailFromDatabase } from '@/core/NoteStore.js';
import { createNoteReactionInDatabase } from '@/core/NoteReactionStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createHonoChartWriters, type HonoChartWriters } from '@/server/chart-runtime.js';
import Logger from '@/logger.js';
import {
	handleHonoQueueAggregateRetention,
	handleHonoQueueBakeBufferedReactions,
	handleHonoQueueCheckExpiredMutings,
	handleHonoQueueClean,
	handleHonoQueueCleanCharts,
	handleHonoQueueResyncCharts,
	handleHonoQueueTickCharts,
	type HonoQueueSystemDependencies,
} from '@/queue/handlers/system.js';
import type { Config } from '@/config.js';

describe('hono-queue-system', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let redis: Redis.Redis;
	let redisForReactions: Redis.Redis;
	let config: Config;
	let chartWriters: HonoChartWriters;
	let deps: HonoQueueSystemDependencies;

	beforeAll(async () => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		redis = new Redis.Redis(config.valkey.primary);
		redisForReactions = new Redis.Redis(config.valkey.reactions);
		const meta = await fetchMetaFromDatabase(db);
		chartWriters = createHonoChartWriters({ db, redis, meta, logger: new Logger('test-chart') });
		deps = { config, db, chartWriters, meta, redisForReactions };
	});

	afterAll(async () => {
		redis.disconnect();
		redisForReactions.disconnect();
		await pool.end();
	});

	describe('handleHonoQueueClean', () => {
		test('期限切れのロールアサインメントを削除する', async () => {
			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			const roleId = genId();
			await createRoleInDatabase(db, {
				id: roleId,
				name: `honoqueuesysrole${roleId}`,
				description: '',
				updatedAt: new Date(),
				lastUsedAt: new Date(),
			});

			const assignmentId = genId();
			await createRoleAssignmentInDatabase(db, {
				id: assignmentId,
				userId,
				roleId,
				expiresAt: new Date(Date.now() - 1000),
			});

			await handleHonoQueueClean(deps);

			const assignmentsAfter = await listRoleAssignmentsByUserIdFromDatabase(db, userId);
			expect(assignmentsAfter.some((a) => a.id === assignmentId)).toBe(false);
		});

		test('90日より古いUserIpを削除する', async () => {
			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			await recordUserIpInDatabase(db, {
				userId,
				ip: '203.0.113.1',
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 91),
			});

			await handleHonoQueueClean(deps);

			const ipsAfter = await listUserIpsFromDatabase(db, userId, 10);
			expect(ipsAfter.length).toBe(0);
		});

		test('deactivateAntennaThresholdが0の場合はアンテナを停止しない', async () => {
			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			const antennaId = genId();
			await createAntennaInDatabase(db, {
				id: antennaId,
				userId,
				name: `honoqueuesysantenna${antennaId}`,
				src: 'all',
				withFile: false,
				keywords: [['test']],
				excludeKeywords: [[]],
				lastUsedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365),
			});

			await handleHonoQueueClean({
				...deps,
				config: { ...config, maintenance: { antennaInactiveAfterMs: 0 } },
			});

			const antennaAfter = await fetchAntennaByIdFromDatabase(db, antennaId);
			expect(antennaAfter?.isActive).not.toBe(false);
		});
	});

	describe('handleHonoQueueAggregateRetention', () => {
		test('本日分のretention_aggregationレコードを作成し、過去のレコードのretention数を更新する', async () => {
			const pastId = genId(Date.now() - 1000 * 60 * 60 * 24 * 5);
			await createRetentionAggregationInDatabase(db, {
				id: pastId,
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
				updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
				dateKey: `retentiontest-${pastId}`,
				userIds: [],
				usersCount: 0,
			});

			await handleHonoQueueAggregateRetention(deps);

			const now = new Date();
			const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
			const records = await listRetentionAggregationsCreatedAfter(db, new Date(Date.now() - 1000 * 60 * 60 * 24 * 31));
			expect(records.some((r) => r.dateKey === dateKey)).toBe(true);

			const pastRecord = records.find((r) => r.id === pastId);
			expect(pastRecord?.data[dateKey]).toBe(0);
		});

		test('既に本日分が存在する場合は重複エラーを握りつぶす', async () => {
			await expect(handleHonoQueueAggregateRetention(deps)).resolves.toBeUndefined();
		});
	});

	describe('chart processors', () => {
		// チャートを1つ追加してハンドラー側への追記を忘れると、そのチャートだけ永久に集計されない。
		// 実DBに対する実行 (SQLの健全性) と、呼び出し対象の網羅の両方を見る。
		function recordChartCalls(): { chartWriters: HonoChartWriters; calls: Map<string, string[]> } {
			const calls = new Map<string, string[]>();
			const spied = Object.fromEntries(
				Object.keys(chartWriters).map((name) => [
					name,
					new Proxy(
						{},
						{
							get: (_target, method: string) => async (): Promise<void> => {
								calls.set(name, [...(calls.get(name) ?? []), method]);
							},
						},
					),
				]),
			) as unknown as HonoChartWriters;
			return { chartWriters: spied, calls };
		}

		test('handleHonoQueueTickCharts: chartWriters の全チャートを tick する', async () => {
			await expect(handleHonoQueueTickCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleHonoQueueTickCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(Object.keys(chartWriters).sort());
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['tick']);
		});

		test('handleHonoQueueResyncCharts: drive/notes/users チャートだけを resync する', async () => {
			await expect(handleHonoQueueResyncCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleHonoQueueResyncCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(['driveChart', 'notesChart', 'usersChart']);
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['resync']);
		});

		test('handleHonoQueueCleanCharts: chartWriters の全チャートを clean する', async () => {
			await expect(handleHonoQueueCleanCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleHonoQueueCleanCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(Object.keys(chartWriters).sort());
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['clean']);
		});
	});

	describe('handleHonoQueueCheckExpiredMutings', () => {
		test('期限切れのユーザーミュート/チャンネルミュートを削除する', async () => {
			const published: { type: string; value: unknown }[] = [];
			const muterId = genId();
			await createUserInDatabase(db, {
				id: muterId,
				username: `honoqueuesys${muterId}`,
				usernameLower: `honoqueuesys${muterId}`.toLowerCase(),
			});
			const muteeId = genId();
			await createUserInDatabase(db, {
				id: muteeId,
				username: `honoqueuesys${muteeId}`,
				usernameLower: `honoqueuesys${muteeId}`.toLowerCase(),
			});
			await createMutingInDatabase(db, {
				id: genId(),
				muterId,
				muteeId,
				expiresAt: new Date(Date.now() - 1000),
			});

			const channelId = genId();
			await createChannelInDatabase(db, {
				id: channelId,
				name: `honoqueuesyschannel${channelId}`,
			});
			await createChannelMutingInDatabase(db, {
				id: genId(),
				userId: muterId,
				channelId,
				expiresAt: new Date(Date.now() - 1000),
			});

			await handleHonoQueueCheckExpiredMutings({
				...deps,
				publishInternalEvent: (type, value) => {
					published.push({ type, value });
				},
			});

			expect(await mutingExistsInDatabase(db, muterId, muteeId)).toBe(false);
			expect(await listActiveMutedChannelIdsByUserIdFromDatabase(db, muterId, new Date())).not.toContain(channelId);

			expect(published).toContainEqual({ type: 'unmute', value: { muterId, muteeId } });
			expect(published).toContainEqual({ type: 'unmuteChannel', value: { userId: muterId, channelId } });
		});
	});

	describe('handleHonoQueueBakeBufferedReactions', () => {
		test('enableReactionsBufferingがfalseの場合は何もしない', async () => {
			await expect(
				handleHonoQueueBakeBufferedReactions({ ...deps, meta: { enableReactionsBuffering: false } }),
			).resolves.toBeUndefined();
		});

		test('バッファされたリアクションをnoteに反映する', async () => {
			const userId = genId();
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'hono-queue-system bake test',
				userId,
				userHost: null,
				visibility: 'public',
			});
			await createNoteReactionInDatabase(db, {
				id: genId(),
				noteId,
				userId,
				reaction: '👍',
			});

			// ioredisのkeyPrefixが自動で前置されるため、ここではbareキーを使う
			// (SCANのMATCHパターンだけは自動前置の対象外なので、本体実装側で手動prefixが必要になる)
			await redisForReactions.hincrby(`reactionsBufferDeltas:${noteId}`, '👍', 1);
			await redisForReactions.zadd(`reactionsBufferPairs:${noteId}`, 0, `${userId}/👍`);

			await handleHonoQueueBakeBufferedReactions({ ...deps, meta: { enableReactionsBuffering: true } });

			const noteAfter = await fetchNoteByIdOrFailFromDatabase(db, noteId);
			expect(noteAfter.reactions['👍']).toBe(1);
			expect(noteAfter.reactionAndUserPairCache).toContain(`${userId}/👍`);
			expect(await redisForReactions.exists(`reactionsBufferDeltas:${noteId}`)).toBe(0);
			expect(await redisForReactions.exists(`reactionsBufferPairs:${noteId}`)).toBe(0);
		});
	});
});
