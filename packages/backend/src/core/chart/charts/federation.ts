/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sql, type SQL } from 'drizzle-orm';
import * as Redis from 'ioredis';
import type { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/federation.js';
import type { KVs } from '../core.js';

/**
 * フェデレーションに関するチャート
 */
@Injectable()
export default class FederationChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private chartLoggerService: ChartLoggerService,
	) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), chartLoggerService.logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		const blocked = this.meta.blockedHosts.flatMap(x => [x, `%.${x}`]);

		const [sub, pub, pubsub, subActive, pubActive] = await Promise.all([
			this.countQuery(sql`
				SELECT COUNT(DISTINCT "following"."followeeHost") AS "count"
				FROM "following"
				WHERE "following"."followeeHost" IS NOT NULL
					AND ${this.notBlockedHost(sql`"following"."followeeHost"`, blocked)}
					AND "following"."followeeHost" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
			`),
			this.countQuery(sql`
				SELECT COUNT(DISTINCT "following"."followerHost") AS "count"
				FROM "following"
				WHERE "following"."followerHost" IS NOT NULL
					AND ${this.notBlockedHost(sql`"following"."followerHost"`, blocked)}
					AND "following"."followerHost" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
			`),
			this.countQuery(sql`
				SELECT COUNT(DISTINCT "following"."followeeHost") AS "count"
				FROM "following"
				WHERE "following"."followeeHost" IS NOT NULL
					AND ${this.notBlockedHost(sql`"following"."followeeHost"`, blocked)}
					AND "following"."followeeHost" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
					AND "following"."followeeHost" IN (
						SELECT "f"."followerHost" FROM "following" AS "f" WHERE "f"."followerHost" IS NOT NULL
					)
			`),
			this.countQuery(sql`
				SELECT COUNT("instance"."id") AS "count"
				FROM "instance"
				WHERE "instance"."host" IN (
						SELECT "f"."followeeHost" FROM "following" AS "f" WHERE "f"."followeeHost" IS NOT NULL
					)
					AND ${this.notBlockedHost(sql`"instance"."host"`, blocked)}
					AND "instance"."suspensionState" = 'none'
					AND "instance"."isNotResponding" = false
			`),
			this.countQuery(sql`
				SELECT COUNT("instance"."id") AS "count"
				FROM "instance"
				WHERE "instance"."host" IN (
						SELECT "f"."followerHost" FROM "following" AS "f" WHERE "f"."followerHost" IS NOT NULL
					)
					AND ${this.notBlockedHost(sql`"instance"."host"`, blocked)}
					AND "instance"."suspensionState" = 'none'
					AND "instance"."isNotResponding" = false
			`),
		]);

		return {
			'sub': sub,
			'pub': pub,
			'pubsub': pubsub,
			'subActive': subActive,
			'pubActive': pubActive,
		};
	}

	private notBlockedHost(column: SQL, blocked: string[]): SQL {
		return blocked.length === 0 ? sql`TRUE` : sql`${column} NOT ILIKE ALL(${blocked})`;
	}

	private async countQuery(query: SQL): Promise<number> {
		const result = await this.drizzle.execute<{ count: string | number }>(query);

		return parseInt(String(result.rows[0]?.count ?? 0), 10);
	}

	@bindThis
	public async deliverd(host: string, succeeded: boolean): Promise<void> {
		await this.commit(succeeded ? {
			'deliveredInstances': [host],
		} : {
			'stalled': [host],
		});
	}

	@bindThis
	public async inbox(host: string): Promise<void> {
		await this.commit({
			'inboxInstances': [host],
		});
	}
}
