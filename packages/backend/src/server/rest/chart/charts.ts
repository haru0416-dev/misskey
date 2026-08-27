/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import Chart, { type KVs } from '@/core/chart/core.js';
import { name as activeUsersChartName, schema as activeUsersChartSchema } from '@/core/chart/entities/active-users.js';
import { name as apRequestChartName, schema as apRequestChartSchema } from '@/core/chart/entities/ap-request.js';
import { name as driveChartName, schema as driveChartSchema } from '@/core/chart/entities/drive.js';
import { name as federationChartName, schema as federationChartSchema } from '@/core/chart/entities/federation.js';
import { name as instanceChartName, schema as instanceChartSchema } from '@/core/chart/entities/instance.js';
import { name as notesChartName, schema as notesChartSchema } from '@/core/chart/entities/notes.js';
import {
	name as perUserDriveChartName,
	schema as perUserDriveChartSchema,
} from '@/core/chart/entities/per-user-drive.js';
import {
	name as perUserFollowingChartName,
	schema as perUserFollowingChartSchema,
} from '@/core/chart/entities/per-user-following.js';
import {
	name as perUserNotesChartName,
	schema as perUserNotesChartSchema,
} from '@/core/chart/entities/per-user-notes.js';
import { name as perUserPvChartName, schema as perUserPvChartSchema } from '@/core/chart/entities/per-user-pv.js';
import {
	name as perUserReactionsChartName,
	schema as perUserReactionsChartSchema,
} from '@/core/chart/entities/per-user-reactions.js';
import { name as usersChartName, schema as usersChartSchema } from '@/core/chart/entities/users.js';
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
		intersection?: string[] | ReadonlyArray<string>;
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
	name: string,
	schema: S,
	grouped = false,
): ReadOnlyChart<S> {
	return new ReadOnlyChart(
		deps.db,
		(key) => acquireChartInsertLock(deps.redis, key),
		deps.logger as Logger,
		name,
		schema,
		grouped,
	);
}

const chartIntegerQueryParams = new Set(['limit', 'offset']);

export function normalizeApiChartQuery(query: Record<string, string>): Record<string, unknown> {
	const body: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(query)) {
		if (chartIntegerQueryParams.has(key) && value === 'null') {
			body[key] = null;
		} else if (chartIntegerQueryParams.has(key)) {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else {
			body[key] = value;
		}
	}

	return body;
}

export const chartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.number().int().min(1).max(500).default(30),
	offset: z.number().int().nullable().default(null),
});

type ChartParams = {
	span: 'day' | 'hour';
	limit: number;
	offset?: number | null;
};

export const perUserChartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.number().int().min(1).max(500).default(30),
	offset: z.number().int().nullable().default(null),
	userId: misskeyId(),
});

type PerUserChartParams = ChartParams & {
	userId: string;
};

export const instanceChartParamDef = z.object({
	span: z.enum(['day', 'hour']),
	limit: z.number().int().min(1).max(500).default(30),
	offset: z.number().int().nullable().default(null),
	host: z.string(),
});

type InstanceChartParams = ChartParams & {
	host: string;
};

export async function handleApiChartsActiveUsers(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, activeUsersChartName, activeUsersChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsApRequest(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, apRequestChartName, apRequestChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsDrive(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, driveChartName, driveChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsFederation(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, federationChartName, federationChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsInstance(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(instanceChartParamDef, body);
	const chart = createApiChart(deps, instanceChartName, instanceChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.host);
}

export async function handleApiChartsNotes(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, notesChartName, notesChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsUsers(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(chartParamDef, body);
	const chart = createApiChart(deps, usersChartName, usersChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleApiChartsUserDrive(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, perUserDriveChartName, perUserDriveChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserFollowing(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, perUserFollowingChartName, perUserFollowingChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserNotes(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, perUserNotesChartName, perUserNotesChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserPv(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, perUserPvChartName, perUserPvChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleApiChartsUserReactions(deps: ApiChartDependencies, body: Record<string, unknown>) {
	const params = parseApiParams(perUserChartParamDef, body);
	const chart = createApiChart(deps, perUserReactionsChartName, perUserReactionsChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

const statsReactionsCountCache = new MemoryKVCache<number>(1000 * 60 * 60);
const statsInstancesCountCache = new MemoryKVCache<number>(1000 * 60 * 60);

export async function handleApiStats(deps: ApiChartDependencies): Promise<Record<string, unknown>> {
	const notesChart = await createApiChart(deps, notesChartName, notesChartSchema).getChart('hour', 1, null);
	const originalNotesCount = notesChart.local.total[0] ?? 0;
	const notesCount = originalNotesCount + (notesChart.remote.total[0] ?? 0);

	const usersChart = await createApiChart(deps, usersChartName, usersChartSchema).getChart('hour', 1, null);
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
