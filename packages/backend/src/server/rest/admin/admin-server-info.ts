/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import { sql } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiAdminServerInfoDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
};

type AdminServerInfoResponse = {
	machine: string;
	os: string;
	node: string;
	psql: string;
	redis?: string;
	cpu: {
		model: string;
		cores: number;
	};
	mem: {
		total: number;
	};
	fs: {
		total: number;
		used: number;
	};
	net: {
		interface: string;
	};
};

export const adminServerInfoParamDef = z.object({});

export async function handleHonoApiAdminServerInfo(
	deps: HonoApiAdminServerInfoDependencies,
	body: Record<string, unknown>,
): Promise<AdminServerInfoResponse> {
	parseHonoApiParams(adminServerInfoParamDef, body);

	const si = await import('systeminformation');
	const memStats = await si.mem();
	const fsStats = await si.fsSize();
	const netInterface = await si.networkInterfaceDefault();
	const redisServerInfo = await deps.redis.info('Server');
	const redisVersion = (
		redisServerInfo.match(new RegExp('^valkey_version:(.*)', 'm'))?.[1] ??
		redisServerInfo.match(new RegExp('^redis_version:(.*)', 'm'))?.[1]
	)?.trim();
	if (redisVersion == null) throw new Error('Redis server version is missing');
	const psqlResult = await deps.db.execute<{ server_version: string }>(sql`SHOW server_version`);
	const psqlVersion = psqlResult.rows[0]?.server_version;
	if (psqlVersion == null) throw new Error('PostgreSQL server version is missing');
	const cpu = os.cpus()[0];
	if (cpu == null) throw new Error('CPU information is unavailable');
	const fs = fsStats[0];
	if (fs == null) throw new Error('Filesystem information is unavailable');

	return {
		machine: os.hostname(),
		os: os.platform(),
		node: process.version,
		psql: psqlVersion,
		redis: redisVersion,
		cpu: {
			model: cpu.model,
			cores: os.cpus().length,
		},
		mem: {
			total: memStats.total,
		},
		fs: {
			total: fs.size,
			used: fs.used,
		},
		net: {
			interface: netInterface,
		},
	};
}
