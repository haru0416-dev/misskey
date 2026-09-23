/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

export type ObserverConfig = {
	databaseUrlEnv: string;
	applicationRole: string;
	redisUrlEnv: string;
	queueKeys: string[];
};
export type Observation<T> = { available: true; value: T } | { available: false; reason: string };

async function observe<T>(fn: () => Promise<T>): Promise<Observation<T>> {
	try {
		return { available: true, value: await fn() };
	} catch (error) {
		return { available: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

export function observer(config: ObserverConfig) {
	const databaseUrl = process.env[config.databaseUrlEnv];
	const redisUrl = process.env[config.redisUrlEnv];
	if (!databaseUrl || !redisUrl) throw new Error('Observer database and Valkey environment variables are required');
	const pool = new Pool({
		connectionString: databaseUrl,
		application_name: 'optimization-observer',
		max: 1,
		connectionTimeoutMillis: 5000,
		statement_timeout: 5000,
	});
	pool.on('error', (error) => console.error('Optimization observer connection error:', error.message));
	const redis = new Redis(redisUrl, {
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		connectTimeout: 5000,
		commandTimeout: 5000,
		retryStrategy: () => null,
	});
	redis.on('error', (error) => console.error('Optimization observer Valkey error:', error.message));
	return {
		async sample(pids: number[]) {
			return {
				at: new Date().toISOString(),
				processes: await observe(async () =>
					Promise.all(
						pids.map(async (pid) => {
							const [stat, status, io] = await Promise.all([
								readFile(`/proc/${pid}/stat`, 'utf8'),
								readFile(`/proc/${pid}/status`, 'utf8'),
								readFile(`/proc/${pid}/io`, 'utf8'),
							]);
							const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
							const rss = /^VmRSS:\s+(\d+) kB$/m.exec(status);
							const readBytes = /^read_bytes:\s+(\d+)$/m.exec(io);
							const writeBytes = /^write_bytes:\s+(\d+)$/m.exec(io);
							if (!rss || !readBytes || !writeBytes) throw new Error(`Incomplete /proc sample for PID ${pid}`);
							return {
								pid,
								startTicks: fields[19],
								cpuTicks: Number(fields[11]) + Number(fields[12]),
								rssBytes: Number(rss[1]) * 1024,
								readBytes: Number(readBytes[1]),
								writeBytes: Number(writeBytes[1]),
							};
						}),
					),
				),
				database: await observe(async () => {
					const identity = (
						await pool.query(
							'SELECT version() AS version, current_database() AS database, current_user AS observer_role',
						)
					).rows[0];
					if (identity.observer_role === config.applicationRole)
						throw new Error('Use a separate observer role so pg_stat_statements excludes measurement SQL');
					const stats = (
						await pool.query(
							`SELECT xact_commit, xact_rollback, blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted, blk_read_time, blk_write_time, deadlocks, stats_reset FROM pg_stat_database WHERE datname = current_database()`,
						)
					).rows[0];
					const connections = (
						await pool.query(
							`SELECT count(*)::int AS total, count(*) FILTER (WHERE state = 'active')::int AS active, count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiting FROM pg_stat_activity WHERE datname = current_database() AND application_name <> 'optimization-observer'`,
						)
					).rows[0];
					const statements = await observe(async () => {
						const settings = (
							await pool.query(
								`SELECT current_setting('pg_stat_statements.track') AS track, current_setting('track_io_timing') AS io_timing`,
							)
						).rows[0];
						if (settings.track !== 'all' || settings.io_timing !== 'on')
							throw new Error('Require pg_stat_statements.track=all and track_io_timing=on');
						const info = (await pool.query('SELECT stats_reset, dealloc FROM pg_stat_statements_info')).rows[0];
						const rows = (
							await pool.query(
								`SELECT queryid::text, calls::float8, total_exec_time, rows::float8, shared_blks_hit::float8, shared_blks_read::float8, temp_blks_written::float8 FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND userid = (SELECT oid FROM pg_roles WHERE rolname = $1) ORDER BY queryid`,
								[config.applicationRole],
							)
						).rows;
						return { settings, info, rows };
					});
					return {
						identity,
						stats,
						connections,
						statements,
						scope:
							'pg_stat_database includes observer transactions; pg_stat_statements filters application role and includes transaction statements. No reset is issued.',
					};
				}),
				outbox: await observe(
					async () =>
						(
							await pool.query(
								`SELECT state, count(*)::int AS count, greatest(0, extract(epoch FROM (now() - min("createdAt"))) * 1000)::float8 AS oldest_ms, coalesce(sum(coalesce(("lastError"->>'attemptsMade')::int, 0)), 0)::int AS recorded_attempts FROM queue_outbox GROUP BY state ORDER BY state`,
							)
						).rows,
				),
				queues: await observe(async () => {
					if (config.queueKeys.length === 0)
						throw new Error('Explicit BullMQ deliver/inbox/db queue key prefixes are required');
					const info = await redis.info('server');
					const version = /^valkey_version:(.+)\r?$/m.exec(info)?.[1]?.trim();
					if (!version) throw new Error('Valkey version missing');
					const queues = await Promise.all(
						config.queueKeys.map(async (key) => {
							if ((await redis.exists(`${key}:meta`)) !== 1)
								throw new Error(`Queue ${key} does not exist; refusing to report an invented zero backlog`);
							const [waiting, active, delayed, failed, completed, paused, prioritized, waitingChildren] =
								await Promise.all([
									redis.llen(`${key}:wait`),
									redis.llen(`${key}:active`),
									redis.zcard(`${key}:delayed`),
									redis.zcard(`${key}:failed`),
									redis.zcard(`${key}:completed`),
									redis.llen(`${key}:paused`),
									redis.zcard(`${key}:prioritized`),
									redis.zcard(`${key}:waiting-children`),
								]);
							const groups = await Promise.all([
								redis.lrange(`${key}:wait`, 0, 1000),
								redis.lrange(`${key}:active`, 0, 1000),
								redis.zrange(`${key}:delayed`, '0', '1000'),
								redis.zrange(`${key}:completed`, '0', '1000'),
								redis.zrange(`${key}:failed`, '0', '1000'),
							]);
							if (groups.some((ids) => ids.length > 1000))
								throw new Error(`Queue ${key} exceeds the preregistered observer scan bound`);
							const pendingIds = new Set(groups.slice(0, 3).flat());
							const jobs = await Promise.all(
								[...new Set(groups.flat())].map(async (id) => {
									const fields = await redis.hmget(
										`${key}:${id}`,
										'timestamp',
										'processedOn',
										'finishedOn',
										'atm',
										'ats',
									);
									if (fields[0] === null)
										return { id, available: false as const, reason: 'Job removed between queue and hash observation' };
									const timestamp = Number(fields[0]);
									const processedOn = fields[1] === null ? null : Number(fields[1]);
									const finishedOn = fields[2] === null ? null : Number(fields[2]);
									const attemptsMade = fields[3] === null ? null : Number(fields[3]);
									const attemptsStarted = fields[4] === null ? null : Number(fields[4]);
									return {
										id,
										available: true as const,
										timestamp,
										processedOn,
										finishedOn,
										attemptsMade,
										attemptsStarted,
										pending: pendingIds.has(id),
										queueWaitMs: processedOn === null ? null : processedOn - timestamp,
										processingMs: finishedOn === null || processedOn === null ? null : finishedOn - processedOn,
									};
								}),
							);
							const events = await redis.xrange(`${key}:events`, '-', '+', 'COUNT', 10001);
							if (events.length > 10000) throw new Error(`Queue ${key} event history exceeds the observer bound`);
							return {
								key,
								waiting,
								active,
								delayed,
								failed,
								completed,
								paused,
								prioritized,
								waitingChildren,
								jobs,
								events,
								scope:
									'Job hashes may be removed; retained BullMQ event IDs independently record waiting/active/completed transitions. Event times use the Valkey clock.',
							};
						}),
					);
					return { version, queues };
				}),
			};
		},
		async close() {
			redis.disconnect();
			await pool.end();
		},
	};
}

export type Sample = Awaited<ReturnType<ReturnType<typeof observer>['sample']>>;

export function pending(sample: Sample): number {
	if (!sample.outbox.available || !sample.queues.available) throw new Error('Backlog observation unavailable');
	if (
		sample.outbox.value.some((row) => row.state === 'deadLetter') ||
		sample.queues.value.queues.some((queue) => queue.failed > 0)
	)
		throw new Error('Dead-letter or failed queue output');
	return (
		sample.outbox.value.reduce((sum, row) => sum + (row.state === 'completed' ? 0 : row.count), 0) +
		sample.queues.value.queues.reduce(
			(sum, queue) =>
				sum + queue.waiting + queue.active + queue.delayed + queue.paused + queue.prioritized + queue.waitingChildren,
			0,
		)
	);
}
