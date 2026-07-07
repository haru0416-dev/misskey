/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import { sql } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseHonoApiParams } from './validation.js';

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
	const redisVersion = redisServerInfo.match(new RegExp('^redis_version:(.*)', 'm'))?.[1];
	const psqlVersion = await deps.db
		.execute<{ server_version: string }>(sql`SHOW server_version`)
		.then(result => result.rows[0].server_version);

	return {
		machine: os.hostname(),
		os: os.platform(),
		node: process.version,
		psql: psqlVersion,
		redis: redisVersion,
		cpu: {
			model: os.cpus()[0].model,
			cores: os.cpus().length,
		},
		mem: {
			total: memStats.total,
		},
		fs: {
			total: fsStats[0].size,
			used: fsStats[0].used,
		},
		net: {
			interface: netInterface,
		},
	};
}
