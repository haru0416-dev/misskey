/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import Chart from '@/core/chart/core.js';
import type { KVs } from '@/core/chart/core.js';
import { chartDefinitions } from '@/server/chart-definitions.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { countNoteReactionsFromDatabase } from '@/core/note/NoteReactionStore.js';
import { countInstancesFromDatabase } from '@/core/instance/InstanceStore.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type Logger from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseApiParams } from '../validation.js';

export type ApiChartDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
};

type ChartSchema = Record<
	string,
	{
		uniqueIncrement?: boolean;
		intersection?: string[] | readonly string[];
		range?: 'big' | 'small' | 'medium';
		accumulate?: boolean;
	}
>;

// getChart()/getChartRaw() は tickMajor/tickMinor を呼ばないため、読み取り専用の stub は
// 各チャートの書き込み側依存なしで Chart.getChart() を呼び出せる。
class ReadOnlyChart<S extends ChartSchema> extends Chart<S> {
	protected async tickMajor(): Promise<Partial<KVs<S>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<S>>> {
		return {};
	}
}

function createApiChart<S extends ChartSchema>(
	deps: ApiChartDependencies,
	definition: { name: string; schema: S; grouped: boolean },
): ReadOnlyChart<S> {
	return new ReadOnlyChart(
		deps.db,
		(key) => acquireChartInsertLock(deps.redis, key),
		deps.logger as Logger,
		definition.name,
		definition.schema,
		definition.grouped,
	);
}

export const chartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.int().min(1).max(500).default(30),
	offset: z.int().nullable().default(null),
});

export const perUserChartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.int().min(1).max(500).default(30),
	offset: z.int().nullable().default(null),
	userId: misskeyId(),
});

export const instanceChartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.int().min(1).max(500).default(30),
	offset: z.int().nullable().default(null),
	host: z.string(),
});

export async function handleApiChartsActiveUsers(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.activeUsers);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsApRequest(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.apRequest);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsDrive(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.drive);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsFederation(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.federation);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsInstance(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(instanceChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.instance);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.host);
}

export async function handleApiChartsNotes(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.notes);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsUsers(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.users);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsUserDrive(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.perUserDrive);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserFollowing(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.perUserFollowing);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserNotes(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.perUserNotes);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserPv(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.perUserPv);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserReactions(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, chartDefinitions.perUserReactions);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

const statsReactionsCountCache = new MemoryKVCache<number>(1000 * 60 * 60);
const statsInstancesCountCache = new MemoryKVCache<number>(1000 * 60 * 60);

export async function handleApiStats(deps: ApiChartDependencies): Promise<Record<string, unknown>> {
	const notesChart = await createApiChart(deps, chartDefinitions.notes).getChart('hour', 1, null);
	const originalNotesCount = notesChart.local.total[0] ?? 0;
	const notesCount = originalNotesCount + (notesChart.remote.total[0] ?? 0);

	const usersChart = await createApiChart(deps, chartDefinitions.users).getChart('hour', 1, null);
	const originalUsersCount = usersChart.local.total[0] ?? 0;
	const usersCount = originalUsersCount + (usersChart.remote.total[0] ?? 0);

	const [reactionsCount, instances] = await Promise.all([
		statsReactionsCountCache.fetch('all', () => countNoteReactionsFromDatabase(deps.db)),
		statsInstancesCountCache.fetch('all', () => countInstancesFromDatabase(deps.db)),
	]);

	return {
		notesCount,
		originalNotesCount,
		usersCount,
		originalUsersCount,
		reactionsCount,
		instances,
		driveUsageLocal: 0,
		driveUsageRemote: 0,
	};
}
