/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { createBunSqlDatabase, createBunSqlClient } from '@/db/bun-sql.js';
import type { SQL as NativeSqlClient } from 'bun';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { retentionAggregation } from '@/db/schema/retention-aggregation.js';
import { createUserInDatabase } from '@/core/user/UserStore.js';
import { recordUserIpInDatabase, listUserIpsFromDatabase } from '@/core/user/UserIpStore.js';
import { createAntennaInDatabase, fetchAntennaByIdFromDatabase } from '@/core/antenna/AntennaStore.js';
import { createRoleInDatabase } from '@/core/role/RoleStore.js';
import {
	createRoleAssignmentInDatabase,
	listRoleAssignmentsByUserIdFromDatabase,
} from '@/core/role/RoleAssignmentStore.js';
import {
	createRetentionAggregationInDatabase,
	listRetentionAggregationsCreatedAfter,
} from '@/core/retention/RetentionAggregationStore.js';
import { fetchMetaFromDatabase } from '@/core/meta/MetaStore.js';
import { createMutingInDatabase, mutingExistsInDatabase } from '@/core/user/MutingStore.js';
import { createChannelInDatabase } from '@/core/channel/ChannelStore.js';
import {
	createChannelMutingInDatabase,
	listActiveMutedChannelIdsByUserIdFromDatabase,
} from '@/core/channel/ChannelMutingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createChartWriters } from '@/core/chart/chart-runtime.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import Logger from '@/logger.js';
import {
	handleQueueAggregateRetention,
	handleQueueCheckExpiredMutings,
	handleQueueClean,
	handleQueueCleanCharts,
	handleQueueResyncCharts,
	handleQueueTickCharts,
} from '@/queue/handlers/system.js';
import type { QueueSystemDependencies } from '@/queue/handlers/system.js';
import type { Config } from '@/config.js';

describe('hono-queue-system', () => {
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;
	let redis: Redis.Redis;
	let config: Config;
	let chartWriters: ChartWriters;
	let deps: QueueSystemDependencies;

	beforeAll(async () => {
		config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
		redis = new Redis.Redis(config.valkey.primary);
		const meta = await fetchMetaFromDatabase(db);
		chartWriters = createChartWriters({ db, redis, meta, logger: new Logger('test-chart') });
		deps = { config, db, chartWriters };
	});

	afterAll(async () => {
		redis.disconnect();
		await pool.close();
	});

	describe('handleQueueClean', () => {
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

			await handleQueueClean(deps);

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

			await handleQueueClean(deps);

			const ipsAfter = await listUserIpsFromDatabase(db, userId, 10);
			expect(ipsAfter).toHaveLength(0);
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

			await handleQueueClean({
				...deps,
				config: { ...config, maintenance: { antennaInactiveAfterMs: 0 } },
			});

			const antennaAfter = await fetchAntennaByIdFromDatabase(db, antennaId);
			expect(antennaAfter?.isActive).not.toBe(false);
		});
	});

	describe('handleQueueAggregateRetention', () => {
		// 本日分が既にあると、ハンドラーは重複として過去分を更新せずに戻る。
		const todayKey = () => {
			const now = new Date();
			return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
		};

		test('本日分のretention_aggregationレコードを作成し、過去のレコードのretention数を更新する', async () => {
			await db.delete(retentionAggregation).where(eq(retentionAggregation.dateKey, todayKey()));
			const pastId = genId(Date.now() - 1000 * 60 * 60 * 24 * 5);
			await createRetentionAggregationInDatabase(db, {
				id: pastId,
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
				updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
				dateKey: `retentiontest-${pastId}`,
				userIds: [],
				usersCount: 0,
			});

			await handleQueueAggregateRetention(deps);

			const dateKey = todayKey();
			const records = await listRetentionAggregationsCreatedAfter(db, new Date(Date.now() - 1000 * 60 * 60 * 24 * 31));
			expect(records.some((r) => r.dateKey === dateKey)).toBe(true);

			const pastRecord = records.find((r) => r.id === pastId);
			expect(pastRecord?.data[dateKey]).toBe(0);
		});

		test('既に本日分が存在する場合は重複エラーを握りつぶす', async () => {
			// 1 回目で本日分を用意する (既にあれば、ここで既に重複の経路を通る)。
			await handleQueueAggregateRetention(deps);
			await expect(handleQueueAggregateRetention(deps)).resolves.toBeUndefined();
			const rows = await db.select().from(retentionAggregation).where(eq(retentionAggregation.dateKey, todayKey()));
			expect(rows).toHaveLength(1);
		});
	});

	describe('chart processors', () => {
		// チャートを1つ追加してハンドラー側への追記を忘れると、そのチャートだけ永久に集計されない。
		// 実DBに対する実行 (SQLの健全性) と、呼び出し対象の網羅の両方を見る。
		function recordChartCalls(): { chartWriters: ChartWriters; calls: Map<string, string[]> } {
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
			) as unknown as ChartWriters;
			return { chartWriters: spied, calls };
		}

		test('handleQueueTickCharts: chartWriters の全チャートを tick する', async () => {
			await expect(handleQueueTickCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleQueueTickCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(Object.keys(chartWriters).sort());
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['tick']);
		});

		test('handleQueueResyncCharts: drive/notes/users チャートだけを resync する', async () => {
			await expect(handleQueueResyncCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleQueueResyncCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(['driveChart', 'notesChart', 'usersChart']);
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['resync']);
		});

		test('handleQueueCleanCharts: chartWriters の全チャートを clean する', async () => {
			await expect(handleQueueCleanCharts(deps)).resolves.toBeUndefined();

			const recorded = recordChartCalls();
			await handleQueueCleanCharts({ ...deps, chartWriters: recorded.chartWriters });
			expect([...recorded.calls.keys()].sort()).toStrictEqual(Object.keys(chartWriters).sort());
			expect([...new Set([...recorded.calls.values()].flat())]).toStrictEqual(['clean']);
		});
	});

	describe('handleQueueCheckExpiredMutings', () => {
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

			await handleQueueCheckExpiredMutings({
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
});
