/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mocked } from 'vitest';
import * as Redis from 'ioredis';
import Chart from '@/core/chart/core.js';
import TestChart from '@/core/chart/charts/test.js';
import TestGroupedChart from '@/core/chart/charts/test-grouped.js';
import TestUniqueChart from '@/core/chart/charts/test-unique.js';
import TestIntersectionChart from '@/core/chart/charts/test-intersection.js';
import { entity as TestChartEntity } from '@/core/chart/charts/entities/test.js';
import { entity as TestGroupedChartEntity } from '@/core/chart/charts/entities/test-grouped.js';
import { entity as TestUniqueChartEntity } from '@/core/chart/charts/entities/test-unique.js';
import { entity as TestIntersectionChartEntity } from '@/core/chart/charts/entities/test-intersection.js';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { resetDatabase, runMigrations } from '@/migration-runner.js';
import Logger from '@/logger.js';

describe('Chart', () => {
	const config = loadConfig();

	let drizzlePool: MiDrizzlePool | undefined;
	let drizzle: MiDrizzleDatabase | undefined;
	let redisClient = {
		set: () => Promise.resolve('OK'),
		get: () => Promise.resolve(null),
		eval: () => Promise.resolve(1),
	} as unknown as Mocked<Redis.Redis>;

	let testChart: TestChart;
	let testGroupedChart: TestGroupedChart;
	let testUniqueChart: TestUniqueChart;
	let testIntersectionChart: TestIntersectionChart;

	beforeEach(async () => {
		if (drizzlePool) await drizzlePool.end();

		drizzlePool = createDrizzlePool(config);
		await resetDatabase(drizzlePool);
		for (const entity of [
			TestChartEntity.hour,
			TestChartEntity.day,
			TestGroupedChartEntity.hour,
			TestGroupedChartEntity.day,
			TestUniqueChartEntity.hour,
			TestUniqueChartEntity.day,
			TestIntersectionChartEntity.hour,
			TestIntersectionChartEntity.day,
		]) {
			for (const statement of Chart.entityToCreateTableSql(entity)) {
				await drizzlePool.query(statement);
			}
		}
		drizzle = createDrizzleDatabase(drizzlePool, config);

		const logger = new Logger('chart'); // TODO: モックにする
		testChart = new TestChart(drizzle, redisClient, logger);
		testGroupedChart = new TestGroupedChart(drizzle, redisClient, logger);
		testUniqueChart = new TestUniqueChart(drizzle, redisClient, logger);
		testIntersectionChart = new TestIntersectionChart(drizzle, redisClient, logger);

		vi.useFakeTimers({
			toFake: ['Date'],
			now: new Date(Date.UTC(2000, 0, 1, 0, 0, 0)),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	afterAll(async () => {
		if (drizzlePool) {
			await resetDatabase(drizzlePool);
			await runMigrations(drizzlePool);
			await drizzlePool.end();
		}
	});

	test('Can updates', async () => {
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates (dec)', async () => {
		await testChart.decrement();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});
	});

	test('Empty chart', async () => {
		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});
	});

	test('Can updates at multiple times at same time', async () => {
		await testChart.increment();
		await testChart.increment();
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});
	});

	test('複数回saveされてもデータの更新は一度だけ', async () => {
		await testChart.increment();
		await testChart.save();
		await testChart.save();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates at different times', async () => {
		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(60 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 仕様上はこうなってほしいけど、実装は難しそうなのでskip
	/*
	test('Can updates at different times without save', async () => {
		await testChart.increment();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0]
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0]
			},
		});
	});
	*/

	test('Can padding', async () => {
		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(2 * 60 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 1],
				total: [2, 1, 1],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 要求された範囲にログがひとつもない場合でもパディングできる
	test('Can padding from past range', async () => {
		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(5 * 60 * 60 * 1000);

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [1, 1, 1],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	// 要求された範囲の最も古い箇所に位置するログが存在しない場合でもパディングできる
	// https://github.com/misskey-dev/misskey/issues/3190
	test('Can padding from past range 2', async () => {
		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(5 * 60 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [2, 1, 1],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset', async () => {
		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(60 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset (floor time)', async () => {
		vi.advanceTimersByTime(30 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		vi.advanceTimersByTime(90 * 60 * 1000);

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		expect(chartHours).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		expect(chartDays).toStrictEqual({
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	describe('Grouped', () => {
		test('Can updates', async () => {
			await testGroupedChart.increment('alice');
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 3, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 3, null, 'alice');
			const bobChartHours = await testGroupedChart.getChart('hour', 3, null, 'bob');
			const bobChartDays = await testGroupedChart.getChart('day', 3, null, 'bob');

			expect(aliceChartHours).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			expect(aliceChartDays).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			expect(bobChartHours).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});

			expect(bobChartDays).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});
		});

		test('同じgroupのsave中に追加されたdiffは次のsaveまで保持される', async () => {
			type UpdateLogById = (span: 'hour' | 'day', id: number, values: Record<string, unknown>) => Promise<void>;
			const chartInternals = testGroupedChart as unknown as { updateLogById: UpdateLogById };
			const updateLogById = chartInternals.updateLogById.bind(testGroupedChart);
			const updateStarted = Promise.withResolvers<void>();
			const continueUpdate = Promise.withResolvers<void>();

			vi.spyOn(chartInternals, 'updateLogById').mockImplementation(async (...args) => {
				updateStarted.resolve();
				await continueUpdate.promise;
				await updateLogById(...args);
			});

			await testGroupedChart.increment('alice');
			const firstSave = testGroupedChart.save();
			await updateStarted.promise;

			await testGroupedChart.increment('alice');
			continueUpdate.resolve();
			await firstSave;
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 1, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 1, null, 'alice');

			expect(aliceChartHours).toStrictEqual({
				foo: {
					dec: [0],
					inc: [2],
					total: [2],
				},
			});
			expect(aliceChartDays).toStrictEqual({
				foo: {
					dec: [0],
					inc: [2],
					total: [2],
				},
			});
		});

		test('重複したsaveは同じdiffを二重に保存しない', async () => {
			type UpdateLogById = (span: 'hour' | 'day', id: number, values: Record<string, unknown>) => Promise<void>;
			const chartInternals = testGroupedChart as unknown as { updateLogById: UpdateLogById };
			const updateLogById = chartInternals.updateLogById.bind(testGroupedChart);
			const updateStarted = Promise.withResolvers<void>();
			const continueUpdate = Promise.withResolvers<void>();

			vi.spyOn(chartInternals, 'updateLogById').mockImplementation(async (...args) => {
				updateStarted.resolve();
				await continueUpdate.promise;
				await updateLogById(...args);
			});

			await testGroupedChart.increment('alice');
			const firstSave = testGroupedChart.save();
			await updateStarted.promise;

			const secondSave = testGroupedChart.save();
			await testGroupedChart.increment('alice');
			continueUpdate.resolve();
			await Promise.all([firstSave, secondSave]);
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 1, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 1, null, 'alice');

			expect(aliceChartHours).toStrictEqual({
				foo: {
					dec: [0],
					inc: [2],
					total: [2],
				},
			});
			expect(aliceChartDays).toStrictEqual({
				foo: {
					dec: [0],
					inc: [2],
					total: [2],
				},
			});
		});
	});

	describe('Unique increment', () => {
		test('Can updates', async () => {
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('bob');
			await testUniqueChart.save();

			const chartHours = await testUniqueChart.getChart('hour', 3, null);
			const chartDays = await testUniqueChart.getChart('day', 3, null);

			expect(chartHours).toStrictEqual({
				foo: [2, 0, 0],
			});

			expect(chartDays).toStrictEqual({
				foo: [2, 0, 0],
			});
		});

		describe('Intersection', () => {
			test('条件が満たされていない場合はカウントされない', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				expect(chartHours).toStrictEqual({
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});

				expect(chartDays).toStrictEqual({
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});
			});

			test('条件が満たされている場合にカウントされる', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.addB('alice');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				expect(chartHours).toStrictEqual({
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});

				expect(chartDays).toStrictEqual({
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});
			});
		});
	});

	describe('Resync', () => {
		test('Can resync', async () => {
			testChart.total = 1;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			expect(chartHours).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});

			expect(chartDays).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});
		});

		test('Can resync (2)', async () => {
			await testChart.increment();
			await testChart.save();

			vi.advanceTimersByTime(60 * 60 * 1000);

			testChart.total = 100;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			expect(chartHours).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [0, 1, 0],
					total: [100, 1, 0],
				},
			});

			expect(chartDays).toStrictEqual({
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [100, 0, 0],
				},
			});
		});
	});
});
