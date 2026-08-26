/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { sql, type SQL } from 'drizzle-orm';
import type * as Redis from 'ioredis';
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
import {
	name as perUserReactionsChartName,
	schema as perUserReactionsChartSchema,
} from '@/core/chart/entities/per-user-reactions.js';
import { name as perUserPvChartName, schema as perUserPvChartSchema } from '@/core/chart/entities/per-user-pv.js';
import { name as usersChartName, schema as usersChartSchema } from '@/core/chart/entities/users.js';
import {
	countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase,
	countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase,
} from '@/core/user/FollowingStore.js';
import { countUsersByHostFromDatabase, countUsersByHostNotNullFromDatabase } from '@/core/user/UserStore.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { parseId } from '@/misc/id/parse-id.js';
import type Logger from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// Chart.commit() はメモリ上の差分だけを保持し、20 分間隔で呼ぶ Chart.save() が永続化する。
// writer は起動時に1回だけ生成し、deps 経由でリクエスト間で共有する。
type HonoChartWriterDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	// FederationChart.tickMinor 用。fetchReactiveMeta が返す、redis 経由の
	// metaUpdated イベントでインプレース更新され続けるオブジェクトをそのまま渡すこと
	// (起動時点のスナップショットを渡すと blockedHosts の変更が反映されなくなる)。
	meta: MiMeta;
};

class HonoDriveChartWriter extends Chart<typeof driveChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof driveChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof driveChartSchema>>> {
		return {};
	}

	public async update(file: Pick<MiDriveFile, 'userHost' | 'size'>, isAdditional: boolean): Promise<void> {
		const fileSizeKb = file.size / 1000;
		this.commit(
			file.userHost === null
				? {
						'local.incCount': isAdditional ? 1 : 0,
						'local.incSize': isAdditional ? fileSizeKb : 0,
						'local.decCount': isAdditional ? 0 : 1,
						'local.decSize': isAdditional ? 0 : fileSizeKb,
					}
				: {
						'remote.incCount': isAdditional ? 1 : 0,
						'remote.incSize': isAdditional ? fileSizeKb : 0,
						'remote.decCount': isAdditional ? 0 : 1,
						'remote.decSize': isAdditional ? 0 : fileSizeKb,
					},
		);
	}
}

class HonoPerUserDriveChartWriter extends Chart<typeof perUserDriveChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserDriveChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserDriveChartSchema>>> {
		return {};
	}

	public async update(file: Pick<MiDriveFile, 'userId' | 'size'>, isAdditional: boolean): Promise<void> {
		if (file.userId == null) return;
		const fileSizeKb = file.size / 1000;
		this.commit(
			{
				totalCount: isAdditional ? 1 : -1,
				totalSize: isAdditional ? fileSizeKb : -fileSizeKb,
				incCount: isAdditional ? 1 : 0,
				incSize: isAdditional ? fileSizeKb : 0,
				decCount: isAdditional ? 0 : 1,
				decSize: isAdditional ? 0 : fileSizeKb,
			},
			file.userId,
		);
	}
}

class HonoInstanceChartWriter extends Chart<typeof instanceChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof instanceChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof instanceChartSchema>>> {
		return {};
	}

	public async updateDrive(file: Pick<MiDriveFile, 'userHost' | 'size'>, isAdditional: boolean): Promise<void> {
		const fileSizeKb = file.size / 1000;
		this.commit(
			{
				'drive.totalFiles': isAdditional ? 1 : -1,
				'drive.incFiles': isAdditional ? 1 : 0,
				'drive.incUsage': isAdditional ? fileSizeKb : 0,
				'drive.decFiles': isAdditional ? 1 : 0,
				'drive.decUsage': isAdditional ? fileSizeKb : 0,
			},
			file.userHost,
		);
	}

	public async requestReceived(host: string): Promise<void> {
		this.commit(
			{
				'requests.received': 1,
			},
			domainToASCII(host.toLowerCase()),
		);
	}

	public async requestSent(host: string, isSucceeded: boolean): Promise<void> {
		this.commit(
			{
				'requests.succeeded': isSucceeded ? 1 : 0,
				'requests.failed': isSucceeded ? 0 : 1,
			},
			domainToASCII(host.toLowerCase()),
		);
	}

	public async newUser(host: string): Promise<void> {
		this.commit(
			{
				'users.total': 1,
				'users.inc': 1,
			},
			domainToASCII(host.toLowerCase()),
		);
	}

	public async updateFollowing(host: string, isAdditional: boolean): Promise<void> {
		this.commit(
			{
				'following.total': isAdditional ? 1 : -1,
				'following.inc': isAdditional ? 1 : 0,
				'following.dec': isAdditional ? 0 : 1,
			},
			domainToASCII(host.toLowerCase()),
		);
	}

	public async updateFollowers(host: string, isAdditional: boolean): Promise<void> {
		this.commit(
			{
				'followers.total': isAdditional ? 1 : -1,
				'followers.inc': isAdditional ? 1 : 0,
				'followers.dec': isAdditional ? 0 : 1,
			},
			domainToASCII(host.toLowerCase()),
		);
	}

	public async updateNote(
		host: string,
		note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>,
		isAdditional: boolean,
	): Promise<void> {
		this.commit(
			{
				'notes.total': isAdditional ? 1 : -1,
				'notes.inc': isAdditional ? 1 : 0,
				'notes.dec': isAdditional ? 0 : 1,
				'notes.diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
				'notes.diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
				'notes.diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
				'notes.diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
			},
			domainToASCII(host.toLowerCase()),
		);
	}
}

class HonoNotesChartWriter extends Chart<typeof notesChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof notesChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof notesChartSchema>>> {
		return {};
	}

	public async update(
		note: Pick<MiNote, 'userHost' | 'replyId' | 'renoteId' | 'fileIds'>,
		isAdditional: boolean,
	): Promise<void> {
		const prefix = note.userHost === null ? 'local' : 'remote';

		this.commit({
			[`${prefix}.total`]: isAdditional ? 1 : -1,
			[`${prefix}.inc`]: isAdditional ? 1 : 0,
			[`${prefix}.dec`]: isAdditional ? 0 : 1,
			[`${prefix}.diffs.normal`]: note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.renote`]: note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.reply`]: note.replyId != null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.withFile`]: note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
		});
	}
}

class HonoPerUserNotesChartWriter extends Chart<typeof perUserNotesChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserNotesChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserNotesChartSchema>>> {
		return {};
	}

	public update(
		user: { id: MiUser['id'] },
		note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>,
		isAdditional: boolean,
	): void {
		this.commit(
			{
				total: isAdditional ? 1 : -1,
				inc: isAdditional ? 1 : 0,
				dec: isAdditional ? 0 : 1,
				'diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
				'diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
				'diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
				'diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
			},
			user.id,
		);
	}
}

class HonoPerUserReactionsChartWriter extends Chart<typeof perUserReactionsChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserReactionsChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserReactionsChartSchema>>> {
		return {};
	}

	public update(user: { id: MiUser['id']; host: MiUser['host'] }, note: Pick<MiNote, 'userId'>): void {
		const prefix = user.host == null ? 'local' : 'remote';
		this.commit(
			{
				[`${prefix}.count`]: 1,
			},
			note.userId,
		);
	}
}

class HonoPerUserPvChartWriter extends Chart<typeof perUserPvChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserPvChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserPvChartSchema>>> {
		return {};
	}

	public async commitByUser(user: { id: MiUser['id'] }, key: string): Promise<void> {
		this.commit(
			{
				'upv.user': [key],
				'pv.user': 1,
			},
			user.id,
		);
	}

	public async commitByVisitor(user: { id: MiUser['id'] }, key: string): Promise<void> {
		this.commit(
			{
				'upv.visitor': [key],
				'pv.visitor': 1,
			},
			user.id,
		);
	}
}

class HonoActiveUsersChartWriter extends Chart<typeof activeUsersChartSchema> {
	constructor(db: MiDrizzleDatabase, lock: (key: string) => ReturnType<typeof acquireChartInsertLock>, logger: Logger) {
		super(db, lock, logger, activeUsersChartName, activeUsersChartSchema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof activeUsersChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof activeUsersChartSchema>>> {
		return {};
	}

	public async write(user: { id: MiUser['id']; host: null }): Promise<void> {
		this.commit({
			write: [user.id],
		});
	}

	public async read(user: { id: MiUser['id']; host: null }): Promise<void> {
		const week = 1000 * 60 * 60 * 24 * 7;
		const month = 1000 * 60 * 60 * 24 * 30;
		const year = 1000 * 60 * 60 * 24 * 365;
		const createdAt = parseId(user.id).date;
		const age = Date.now() - createdAt.getTime();

		this.commit({
			read: [user.id],
			registeredWithinWeek: age < week ? [user.id] : [],
			registeredWithinMonth: age < month ? [user.id] : [],
			registeredWithinYear: age < year ? [user.id] : [],
			registeredOutsideWeek: age > week ? [user.id] : [],
			registeredOutsideMonth: age > month ? [user.id] : [],
			registeredOutsideYear: age > year ? [user.id] : [],
		});
	}
}

class HonoFederationChartWriter extends Chart<typeof federationChartSchema> {
	constructor(
		db: MiDrizzleDatabase,
		lock: (key: string) => ReturnType<typeof acquireChartInsertLock>,
		logger: Logger,
		private drizzle: MiDrizzleDatabase,
		private meta: Pick<MiMeta, 'blockedHosts'>,
	) {
		super(db, lock, logger, federationChartName, federationChartSchema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof federationChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof federationChartSchema>>> {
		const blocked = this.meta.blockedHosts.flatMap((x) => [x, `%.${x}`]);

		const [sub, pub, pubsub, subActive, pubActive] = await Promise.all([
			this.countQuery(sql`
				SELECT COUNT(*) AS "count"
				FROM (${this.distinctFollowingHosts('followeeHost')}) AS "sub"("host")
				WHERE ${this.notBlockedHost(sql`"sub"."host"`, blocked)}
					AND "sub"."host" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
			`),
			this.countQuery(sql`
				SELECT COUNT(*) AS "count"
				FROM (${this.distinctFollowingHosts('followerHost')}) AS "pub"("host")
				WHERE ${this.notBlockedHost(sql`"pub"."host"`, blocked)}
					AND "pub"."host" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
			`),
			this.countQuery(sql`
				SELECT COUNT(*) AS "count"
				FROM (${this.distinctFollowingHosts('followeeHost')}) AS "pubsub"("host")
				WHERE ${this.notBlockedHost(sql`"pubsub"."host"`, blocked)}
					AND "pubsub"."host" NOT IN (
						SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
					)
					AND EXISTS (
						SELECT 1 FROM "following" AS "f" WHERE "f"."followerHost" = "pubsub"."host"
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
			sub: sub,
			pub: pub,
			pubsub: pubsub,
			subActive: subActive,
			pubActive: pubActive,
		};
	}

	/**
	 * following テーブルの host カラムの distinct 値集合を recursive CTE の
	 * loose index scan (インデックス端を1ホストずつ辿る) で列挙する。
	 * 元の COUNT(DISTINCT ...) は following 全行のソートを毎 tick 走らせていたが、
	 * この形は O(distinct host 数 × log(following 行数)) で済み、既存の
	 * followeeHost / followerHost 単列インデックスにそのまま乗る。
	 * COUNT(DISTINCT) と同じく「instance 行が存在しない host」も数えるため意味は同一。
	 */
	private distinctFollowingHosts(column: 'followeeHost' | 'followerHost'): SQL {
		const col = sql.raw(`"${column}"`);
		return sql`
			WITH RECURSIVE "hosts"("host") AS (
				(SELECT ${col} FROM "following" WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT 1)
				UNION ALL
				SELECT (
					SELECT "f".${col} FROM "following" AS "f"
					WHERE "f".${col} > "hosts"."host"
					ORDER BY "f".${col} LIMIT 1
				)
				FROM "hosts" WHERE "hosts"."host" IS NOT NULL
			)
			SELECT "host" FROM "hosts" WHERE "host" IS NOT NULL
		`;
	}

	private notBlockedHost(column: SQL, blocked: string[]): SQL {
		// 生の JS 配列は drizzle により record へ展開され、ANY/ALL の右辺に必要な配列にならない。
		// sql.param で単一の配列パラメータとして渡す。
		return blocked.length === 0 ? sql`TRUE` : sql`${column} NOT ILIKE ALL(${sql.param(blocked)})`;
	}

	private async countQuery(query: SQL): Promise<number> {
		const result = await this.drizzle.execute<{ count: string | number }>(query);

		return Number.parseInt(String(result.rows[0]?.count ?? 0), 10);
	}

	public async deliverd(host: string, succeeded: boolean): Promise<void> {
		this.commit(
			succeeded
				? {
						deliveredInstances: [host],
					}
				: {
						stalled: [host],
					},
		);
	}

	public async inbox(host: string): Promise<void> {
		this.commit({
			inboxInstances: [host],
		});
	}
}

class HonoUsersChartWriter extends Chart<typeof usersChartSchema> {
	constructor(
		db: MiDrizzleDatabase,
		lock: (key: string) => ReturnType<typeof acquireChartInsertLock>,
		logger: Logger,
		private drizzle: MiDrizzleDatabase,
	) {
		super(db, lock, logger, usersChartName, usersChartSchema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof usersChartSchema>>> {
		const [localCount, remoteCount] = await Promise.all([
			countUsersByHostFromDatabase(this.drizzle, null),
			countUsersByHostNotNullFromDatabase(this.drizzle),
		]);

		return {
			'local.total': localCount,
			'remote.total': remoteCount,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof usersChartSchema>>> {
		return {};
	}

	public async update(user: { id: MiUser['id']; host: MiUser['host'] }, isAdditional: boolean): Promise<void> {
		const prefix = user.host == null ? 'local' : 'remote';

		this.commit({
			[`${prefix}.total`]: isAdditional ? 1 : -1,
			[`${prefix}.inc`]: isAdditional ? 1 : 0,
			[`${prefix}.dec`]: isAdditional ? 0 : 1,
		});
	}
}

class HonoPerUserFollowingChartWriter extends Chart<typeof perUserFollowingChartSchema> {
	constructor(
		db: MiDrizzleDatabase,
		lock: (key: string) => ReturnType<typeof acquireChartInsertLock>,
		logger: Logger,
		private drizzle: MiDrizzleDatabase,
	) {
		super(db, lock, logger, perUserFollowingChartName, perUserFollowingChartSchema, true);
	}

	protected async tickMajor(group: string): Promise<Partial<KVs<typeof perUserFollowingChartSchema>>> {
		const [localFollowingsCount, localFollowersCount, remoteFollowingsCount, remoteFollowersCount] = await Promise.all([
			countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase(this.drizzle, group, false),
			countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase(this.drizzle, group, false),
			countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase(this.drizzle, group, true),
			countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase(this.drizzle, group, true),
		]);

		return {
			'local.followings.total': localFollowingsCount,
			'local.followers.total': localFollowersCount,
			'remote.followings.total': remoteFollowingsCount,
			'remote.followers.total': remoteFollowersCount,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserFollowingChartSchema>>> {
		return {};
	}

	public update(
		follower: { id: MiUser['id']; host: MiUser['host'] },
		followee: { id: MiUser['id']; host: MiUser['host'] },
		isFollow: boolean,
	): void {
		const prefixFollower = follower.host == null ? 'local' : 'remote';
		const prefixFollowee = followee.host == null ? 'local' : 'remote';

		this.commit(
			{
				[`${prefixFollower}.followings.total`]: isFollow ? 1 : -1,
				[`${prefixFollower}.followings.inc`]: isFollow ? 1 : 0,
				[`${prefixFollower}.followings.dec`]: isFollow ? 0 : 1,
			},
			follower.id,
		);
		this.commit(
			{
				[`${prefixFollowee}.followers.total`]: isFollow ? 1 : -1,
				[`${prefixFollowee}.followers.inc`]: isFollow ? 1 : 0,
				[`${prefixFollowee}.followers.dec`]: isFollow ? 0 : 1,
			},
			followee.id,
		);
	}
}

class HonoApRequestChartWriter extends Chart<typeof apRequestChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof apRequestChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof apRequestChartSchema>>> {
		return {};
	}

	public async deliverSucc(): Promise<void> {
		this.commit({
			deliverSucceeded: 1,
		});
	}

	public async deliverFail(): Promise<void> {
		this.commit({
			deliverFailed: 1,
		});
	}

	public async inbox(): Promise<void> {
		this.commit({
			inboxReceived: 1,
		});
	}
}

export type HonoChartWriters = {
	driveChart: HonoDriveChartWriter;
	perUserDriveChart: HonoPerUserDriveChartWriter;
	instanceChart: HonoInstanceChartWriter;
	notesChart: HonoNotesChartWriter;
	perUserNotesChart: HonoPerUserNotesChartWriter;
	activeUsersChart: HonoActiveUsersChartWriter;
	perUserReactionsChart: HonoPerUserReactionsChartWriter;
	perUserPvChart: HonoPerUserPvChartWriter;
	federationChart: HonoFederationChartWriter;
	usersChart: HonoUsersChartWriter;
	perUserFollowingChart: HonoPerUserFollowingChartWriter;
	apRequestChart: HonoApRequestChartWriter;
};

export function createHonoChartWriters(deps: HonoChartWriterDependencies): HonoChartWriters {
	const lock = (key: string) => acquireChartInsertLock(deps.redis, key);
	const logger = deps.logger as Logger;

	return {
		driveChart: new HonoDriveChartWriter(deps.db, lock, logger, driveChartName, driveChartSchema),
		perUserDriveChart: new HonoPerUserDriveChartWriter(
			deps.db,
			lock,
			logger,
			perUserDriveChartName,
			perUserDriveChartSchema,
			true,
		),
		instanceChart: new HonoInstanceChartWriter(deps.db, lock, logger, instanceChartName, instanceChartSchema, true),
		notesChart: new HonoNotesChartWriter(deps.db, lock, logger, notesChartName, notesChartSchema),
		perUserNotesChart: new HonoPerUserNotesChartWriter(
			deps.db,
			lock,
			logger,
			perUserNotesChartName,
			perUserNotesChartSchema,
			true,
		),
		activeUsersChart: new HonoActiveUsersChartWriter(deps.db, lock, logger),
		perUserReactionsChart: new HonoPerUserReactionsChartWriter(
			deps.db,
			lock,
			logger,
			perUserReactionsChartName,
			perUserReactionsChartSchema,
			true,
		),
		perUserPvChart: new HonoPerUserPvChartWriter(deps.db, lock, logger, perUserPvChartName, perUserPvChartSchema, true),
		federationChart: new HonoFederationChartWriter(deps.db, lock, logger, deps.db, deps.meta),
		usersChart: new HonoUsersChartWriter(deps.db, lock, logger, deps.db),
		perUserFollowingChart: new HonoPerUserFollowingChartWriter(deps.db, lock, logger, deps.db),
		apRequestChart: new HonoApRequestChartWriter(deps.db, lock, logger, apRequestChartName, apRequestChartSchema),
	};
}

export async function saveHonoChartWriters(writers: HonoChartWriters): Promise<void> {
	await Promise.all([
		writers.driveChart.save(),
		writers.perUserDriveChart.save(),
		writers.instanceChart.save(),
		writers.notesChart.save(),
		writers.perUserNotesChart.save(),
		writers.activeUsersChart.save(),
		writers.perUserReactionsChart.save(),
		writers.perUserPvChart.save(),
		writers.federationChart.save(),
		writers.usersChart.save(),
		writers.perUserFollowingChart.save(),
		writers.apRequestChart.save(),
	]);
}

export function startHonoChartWriterSaveInterval(writers: HonoChartWriters): NodeJS.Timeout {
	return setInterval(
		() => {
			void saveHonoChartWriters(writers);
		},
		1000 * 60 * 20,
	);
}
