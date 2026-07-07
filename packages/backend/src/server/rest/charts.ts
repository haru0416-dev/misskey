/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import Chart, { type KVs } from '@/core/chart/core.js';
import { name as activeUsersChartName, schema as activeUsersChartSchema } from '@/core/chart/charts/entities/active-users.js';
import { name as apRequestChartName, schema as apRequestChartSchema } from '@/core/chart/charts/entities/ap-request.js';
import { name as driveChartName, schema as driveChartSchema } from '@/core/chart/charts/entities/drive.js';
import { name as federationChartName, schema as federationChartSchema } from '@/core/chart/charts/entities/federation.js';
import { name as instanceChartName, schema as instanceChartSchema } from '@/core/chart/charts/entities/instance.js';
import { name as notesChartName, schema as notesChartSchema } from '@/core/chart/charts/entities/notes.js';
import { name as perUserDriveChartName, schema as perUserDriveChartSchema } from '@/core/chart/charts/entities/per-user-drive.js';
import { name as perUserFollowingChartName, schema as perUserFollowingChartSchema } from '@/core/chart/charts/entities/per-user-following.js';
import { name as perUserNotesChartName, schema as perUserNotesChartSchema } from '@/core/chart/charts/entities/per-user-notes.js';
import { name as perUserPvChartName, schema as perUserPvChartSchema } from '@/core/chart/charts/entities/per-user-pv.js';
import { name as perUserReactionsChartName, schema as perUserReactionsChartSchema } from '@/core/chart/charts/entities/per-user-reactions.js';
import { name as usersChartName, schema as usersChartSchema } from '@/core/chart/charts/entities/users.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { countNoteReactionsFromDatabase } from '@/core/NoteReactionStore.js';
import { countInstancesFromDatabase } from '@/core/InstanceStore.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type Logger from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiChartDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
};

type HonoChartSchema = Record<string, {
	uniqueIncrement?: boolean;
	intersection?: string[] | ReadonlyArray<string>;
	range?: 'big' | 'small' | 'medium';
	accumulate?: boolean;
}>;

// getChart()/getChartRaw() never touch tickMajor/tickMinor (those only run on the
// write-side tick()/save() paths), so a read-only stub is a faithful, stateless port
// of Chart.getChart() without needing the write-side services each concrete NestJS
// chart subclass otherwise requires (UserEntityService, UtilityService, IdService, etc).
class HonoReadOnlyChart<S extends HonoChartSchema> extends Chart<S> {
	protected async tickMajor(): Promise<Partial<KVs<S>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<S>>> {
		return {};
	}
}

function createHonoApiChart<S extends HonoChartSchema>(
	deps: HonoApiChartDependencies,
	name: string,
	schema: S,
	grouped = false,
): HonoReadOnlyChart<S> {
	return new HonoReadOnlyChart(
		deps.db,
		(key) => acquireChartInsertLock(deps.redis, key),
		deps.logger as Logger,
		name,
		schema,
		grouped,
	);
}

const chartIntegerQueryParams = new Set(['limit', 'offset']);

export function normalizeHonoApiChartQuery(query: Record<string, string>): Record<string, unknown> {
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

export async function handleHonoApiChartsActiveUsers(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, activeUsersChartName, activeUsersChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsApRequest(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, apRequestChartName, apRequestChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsDrive(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, driveChartName, driveChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsFederation(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, federationChartName, federationChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsInstance(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(instanceChartParamDef, body);
	const chart = createHonoApiChart(deps, instanceChartName, instanceChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.host);
}

export async function handleHonoApiChartsNotes(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, notesChartName, notesChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsUsers(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(chartParamDef, body);
	const chart = createHonoApiChart(deps, usersChartName, usersChartSchema);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null);
}

export async function handleHonoApiChartsUserDrive(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(perUserChartParamDef, body);
	const chart = createHonoApiChart(deps, perUserDriveChartName, perUserDriveChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleHonoApiChartsUserFollowing(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(perUserChartParamDef, body);
	const chart = createHonoApiChart(deps, perUserFollowingChartName, perUserFollowingChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleHonoApiChartsUserNotes(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(perUserChartParamDef, body);
	const chart = createHonoApiChart(deps, perUserNotesChartName, perUserNotesChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleHonoApiChartsUserPv(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(perUserChartParamDef, body);
	const chart = createHonoApiChart(deps, perUserPvChartName, perUserPvChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

export async function handleHonoApiChartsUserReactions(deps: HonoApiChartDependencies, body: Record<string, unknown>) {
	const params = parseHonoApiParams(perUserChartParamDef, body);
	const chart = createHonoApiChart(deps, perUserReactionsChartName, perUserReactionsChartSchema, true);
	return await chart.getChart(params.span, params.limit, params.offset ? new Date(params.offset) : null, params.userId);
}

const statsReactionsCountCache = new MemoryKVCache<number>(1000 * 60 * 60); // 1h
const statsInstancesCountCache = new MemoryKVCache<number>(1000 * 60 * 60); // 1h

export async function handleHonoApiStats(deps: HonoApiChartDependencies): Promise<Record<string, unknown>> {
	const notesChart = await createHonoApiChart(deps, notesChartName, notesChartSchema).getChart('hour', 1, null);
	const notesCount = notesChart.local.total[0] + notesChart.remote.total[0];
	const originalNotesCount = notesChart.local.total[0];

	const usersChart = await createHonoApiChart(deps, usersChartName, usersChartSchema).getChart('hour', 1, null);
	const usersCount = usersChart.local.total[0] + usersChart.remote.total[0];
	const originalUsersCount = usersChart.local.total[0];

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
