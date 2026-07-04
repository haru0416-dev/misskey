/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { recordUserIpInDatabase, listUserIpsFromDatabase } from '@/core/UserIpStore.js';
import { createAntennaInDatabase, fetchAntennaByIdFromDatabase } from '@/core/AntennaStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { createRoleAssignmentInDatabase, listRoleAssignmentsByUserIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { createRetentionAggregationInDatabase, listRetentionAggregationsCreatedAfter } from '@/core/RetentionAggregationStore.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createHonoChartWriters, type HonoChartWriters } from '@/server/hono-chart-runtime.js';
import Logger from '@/logger.js';
import {
	handleHonoQueueAggregateRetention,
	handleHonoQueueClean,
	handleHonoQueueCleanCharts,
	handleHonoQueueResyncCharts,
	handleHonoQueueTickCharts,
	type HonoQueueSystemDependencies,
} from '@/server/hono-queue-system.js';
import type { Config } from '@/config.js';

describe('hono-queue-system', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let redis: Redis.Redis;
	let config: Config;
	let chartWriters: HonoChartWriters;
	let deps: HonoQueueSystemDependencies;

	beforeAll(async () => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		redis = new Redis.Redis(config.redis);
		const meta = await fetchMetaFromDatabase(db);
		chartWriters = createHonoChartWriters({ db, redis, config, meta, logger: new Logger('test-chart') });
		deps = { config, db, chartWriters };
	});

	afterAll(async () => {
		redis.disconnect();
		await pool.end();
	});

	describe('handleHonoQueueClean', () => {
		test('期限切れのロールアサインメントを削除する', async () => {
			const userId = genId(config);
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			const roleId = genId(config);
			await createRoleInDatabase(db, {
				id: roleId,
				name: `honoqueuesysrole${roleId}`,
				description: '',
				updatedAt: new Date(),
				lastUsedAt: new Date(),
			});

			const assignmentId = genId(config);
			await createRoleAssignmentInDatabase(db, {
				id: assignmentId,
				userId,
				roleId,
				expiresAt: new Date(Date.now() - 1000),
			});

			await handleHonoQueueClean(deps);

			const assignmentsAfter = await listRoleAssignmentsByUserIdFromDatabase(db, userId);
			expect(assignmentsAfter.some(a => a.id === assignmentId)).toBe(false);
		});

		test('90日より古いUserIpを削除する', async () => {
			const userId = genId(config);
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			await recordUserIpInDatabase(db, {
				userId,
				ip: '203.0.113.1',
				createdAt: new Date(Date.now() - (1000 * 60 * 60 * 24 * 91)),
			});

			await handleHonoQueueClean(deps);

			const ipsAfter = await listUserIpsFromDatabase(db, userId, 10);
			expect(ipsAfter.length).toBe(0);
		});

		test('deactivateAntennaThresholdが0の場合はアンテナを停止しない', async () => {
			const userId = genId(config);
			await createUserInDatabase(db, {
				id: userId,
				username: `honoqueuesys${userId}`,
				usernameLower: `honoqueuesys${userId}`.toLowerCase(),
			});

			const antennaId = genId(config);
			await createAntennaInDatabase(db, {
				id: antennaId,
				userId,
				name: `honoqueuesysantenna${antennaId}`,
				src: 'all',
				withFile: false,
				keywords: [['test']],
				excludeKeywords: [[]],
				lastUsedAt: new Date(Date.now() - (1000 * 60 * 60 * 24 * 365)),
			});

			await handleHonoQueueClean({ ...deps, config: { ...config, deactivateAntennaThreshold: 0 } });

			const antennaAfter = await fetchAntennaByIdFromDatabase(db, antennaId);
			expect(antennaAfter?.isActive).not.toBe(false);
		});
	});

	describe('handleHonoQueueAggregateRetention', () => {
		test('本日分のretention_aggregationレコードを作成し、過去のレコードのretention数を更新する', async () => {
			const pastId = genId(config, Date.now() - (1000 * 60 * 60 * 24 * 5));
			await createRetentionAggregationInDatabase(db, {
				id: pastId,
				createdAt: new Date(Date.now() - (1000 * 60 * 60 * 24 * 5)),
				updatedAt: new Date(Date.now() - (1000 * 60 * 60 * 24 * 5)),
				dateKey: `retentiontest-${pastId}`,
				userIds: [],
				usersCount: 0,
			});

			await handleHonoQueueAggregateRetention(deps);

			const now = new Date();
			const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
			const records = await listRetentionAggregationsCreatedAfter(db, new Date(Date.now() - (1000 * 60 * 60 * 24 * 31)));
			expect(records.some(r => r.dateKey === dateKey)).toBe(true);

			const pastRecord = records.find(r => r.id === pastId);
			expect(pastRecord?.data[dateKey]).toBe(0);
		});

		test('既に本日分が存在する場合は重複エラーを握りつぶす', async () => {
			await expect(handleHonoQueueAggregateRetention(deps)).resolves.toBeUndefined();
		});
	});

	describe('chart processors', () => {
		test('handleHonoQueueTickCharts: 12種のチャートを直列にtickする', async () => {
			await expect(handleHonoQueueTickCharts(deps)).resolves.toBeUndefined();
		});

		test('handleHonoQueueResyncCharts: drive/notes/usersチャートをresyncする', async () => {
			await expect(handleHonoQueueResyncCharts(deps)).resolves.toBeUndefined();
		});

		test('handleHonoQueueCleanCharts: 12種のチャートを直列にcleanする', async () => {
			await expect(handleHonoQueueCleanCharts(deps)).resolves.toBeUndefined();
		});
	});
});
