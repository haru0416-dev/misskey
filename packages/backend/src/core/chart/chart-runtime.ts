/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny } from '@/misc/to-puny.js';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import { createChart } from '@/core/chart/core.js';
import type { ChartOptions } from '@/core/chart/core.js';
import {
	countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase,
	countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase,
} from '@/core/user/following-store.js';
import { countUsersByHostFromDatabase, countUsersByHostNotNullFromDatabase } from '@/core/user/user-store.js';
import { chartDefinitions } from '@/core/chart/chart-definitions.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Logger } from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/entities.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// Chart.commit() はメモリ上の差分だけを保持し、20 分間隔で呼ぶ Chart.save() が永続化する。
// writer は起動時に1回だけ生成し、deps 経由でリクエスト間で共有する。
type ChartWriterDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	// FederationChart.tickMinor 用。fetchReactiveMeta が返す、redis 経由の
	// metaUpdated イベントでインプレース更新され続けるオブジェクトをそのまま渡すこと
	// (起動時点のスナップショットを渡すと blockedHosts の変更が反映されなくなる)。
	meta: MiMeta;
};

type ChartCoreDependencies = {
	db: MiDrizzleDatabase;
	lock: (key: string) => ReturnType<typeof acquireChartInsertLock>;
	logger: Logger;
};

/** 定義 (名前・スキーマ) から集計を作る。差分を積む commit は、書き込み関数だけが持つよう、公開する操作と分けて返す。 */
function createChartWithCommit<K extends keyof typeof chartDefinitions>(
	core: ChartCoreDependencies,
	key: K,
	ticks: Pick<ChartOptions<(typeof chartDefinitions)[K]['schema']>, 'tickMajor' | 'tickMinor'> = {},
) {
	const definition = chartDefinitions[key];
	const { commit, ...chart } = createChart({ ...core, name: definition.name, schema: definition.schema, ...ticks });
	return { commit, chart };
}

function createDriveChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'drive');

	return {
		...chart,
		async update(file: Pick<MiDriveFile, 'userHost' | 'size'>, isAdditional: boolean): Promise<void> {
			const fileSizeKb = file.size / 1000;
			commit(
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
		},
	};
}

type DriveChartWriter = ReturnType<typeof createDriveChartWriter>;

function createPerUserDriveChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'perUserDrive');

	return {
		...chart,
		async update(file: Pick<MiDriveFile, 'userId' | 'size'>, isAdditional: boolean): Promise<void> {
			if (file.userId == null) {
				return;
			}
			const fileSizeKb = file.size / 1000;
			commit(
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
		},
	};
}

type PerUserDriveChartWriter = ReturnType<typeof createPerUserDriveChartWriter>;

function createInstanceChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'instance');

	return {
		...chart,
		async updateDrive(file: Pick<MiDriveFile, 'userHost' | 'size'>, isAdditional: boolean): Promise<void> {
			const fileSizeKb = file.size / 1000;
			commit(
				{
					'drive.totalFiles': isAdditional ? 1 : -1,
					'drive.incFiles': isAdditional ? 1 : 0,
					'drive.incUsage': isAdditional ? fileSizeKb : 0,
					'drive.decFiles': isAdditional ? 1 : 0,
					'drive.decUsage': isAdditional ? fileSizeKb : 0,
				},
				file.userHost,
			);
		},

		async requestReceived(host: string): Promise<void> {
			commit(
				{
					'requests.received': 1,
				},
				toPuny(host),
			);
		},

		async requestSent(host: string, isSucceeded: boolean): Promise<void> {
			commit(
				{
					'requests.succeeded': isSucceeded ? 1 : 0,
					'requests.failed': isSucceeded ? 0 : 1,
				},
				toPuny(host),
			);
		},

		async newUser(host: string): Promise<void> {
			commit(
				{
					'users.total': 1,
					'users.inc': 1,
				},
				toPuny(host),
			);
		},

		async updateFollowing(host: string, isAdditional: boolean): Promise<void> {
			commit(
				{
					'following.total': isAdditional ? 1 : -1,
					'following.inc': isAdditional ? 1 : 0,
					'following.dec': isAdditional ? 0 : 1,
				},
				toPuny(host),
			);
		},

		async updateFollowers(host: string, isAdditional: boolean): Promise<void> {
			commit(
				{
					'followers.total': isAdditional ? 1 : -1,
					'followers.inc': isAdditional ? 1 : 0,
					'followers.dec': isAdditional ? 0 : 1,
				},
				toPuny(host),
			);
		},

		async updateNote(
			host: string,
			note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>,
			isAdditional: boolean,
		): Promise<void> {
			commit(
				{
					'notes.total': isAdditional ? 1 : -1,
					'notes.inc': isAdditional ? 1 : 0,
					'notes.dec': isAdditional ? 0 : 1,
					'notes.diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
					'notes.diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
					'notes.diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
					'notes.diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
				},
				toPuny(host),
			);
		},
	};
}

type InstanceChartWriter = ReturnType<typeof createInstanceChartWriter>;

function createNotesChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'notes');

	return {
		...chart,
		async update(
			note: Pick<MiNote, 'userHost' | 'replyId' | 'renoteId' | 'fileIds'>,
			isAdditional: boolean,
		): Promise<void> {
			const prefix = note.userHost === null ? 'local' : 'remote';

			commit({
				[`${prefix}.total`]: isAdditional ? 1 : -1,
				[`${prefix}.inc`]: isAdditional ? 1 : 0,
				[`${prefix}.dec`]: isAdditional ? 0 : 1,
				[`${prefix}.diffs.normal`]: note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
				[`${prefix}.diffs.renote`]: note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
				[`${prefix}.diffs.reply`]: note.replyId != null ? (isAdditional ? 1 : -1) : 0,
				[`${prefix}.diffs.withFile`]: note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
			});
		},
	};
}

type NotesChartWriter = ReturnType<typeof createNotesChartWriter>;

function createPerUserNotesChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'perUserNotes');

	return {
		...chart,
		update(
			user: { id: MiUser['id'] },
			note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>,
			isAdditional: boolean,
		): void {
			commit(
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
		},
	};
}

type PerUserNotesChartWriter = ReturnType<typeof createPerUserNotesChartWriter>;

function createPerUserReactionsChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'perUserReactions');

	return {
		...chart,
		update(user: { id: MiUser['id']; host: MiUser['host'] }, note: Pick<MiNote, 'userId'>): void {
			const prefix = user.host == null ? 'local' : 'remote';
			commit(
				{
					[`${prefix}.count`]: 1,
				},
				note.userId,
			);
		},
	};
}

type PerUserReactionsChartWriter = ReturnType<typeof createPerUserReactionsChartWriter>;

function createPerUserPvChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'perUserPv');

	return {
		...chart,
		async commitByUser(user: { id: MiUser['id'] }, key: string): Promise<void> {
			commit(
				{
					'upv.user': [key],
					'pv.user': 1,
				},
				user.id,
			);
		},

		async commitByVisitor(user: { id: MiUser['id'] }, key: string): Promise<void> {
			commit(
				{
					'upv.visitor': [key],
					'pv.visitor': 1,
				},
				user.id,
			);
		},
	};
}

type PerUserPvChartWriter = ReturnType<typeof createPerUserPvChartWriter>;

function createActiveUsersChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'activeUsers');

	return {
		...chart,
		async write(user: { id: MiUser['id']; host: null }): Promise<void> {
			commit({
				write: [user.id],
			});
		},

		async read(user: { id: MiUser['id']; host: null }): Promise<void> {
			const week = 1000 * 60 * 60 * 24 * 7;
			const month = 1000 * 60 * 60 * 24 * 30;
			const year = 1000 * 60 * 60 * 24 * 365;
			const createdAt = parseId(user.id).date;
			const age = Date.now() - createdAt.getTime();

			commit({
				read: [user.id],
				registeredWithinWeek: age < week ? [user.id] : [],
				registeredWithinMonth: age < month ? [user.id] : [],
				registeredWithinYear: age < year ? [user.id] : [],
				registeredOutsideWeek: age > week ? [user.id] : [],
				registeredOutsideMonth: age > month ? [user.id] : [],
				registeredOutsideYear: age > year ? [user.id] : [],
			});
		},
	};
}

type ActiveUsersChartWriter = ReturnType<typeof createActiveUsersChartWriter>;

function createFederationChartWriter(core: ChartCoreDependencies, meta: Pick<MiMeta, 'blockedHosts'>) {
	/**
	 * following テーブルの host カラムの distinct 値集合を recursive CTE の
	 * loose index scan (インデックス端を1ホストずつ辿る) で列挙する。
	 * 全行をソートせず O(distinct host 数 × log(following 行数)) で済み、
	 * followeeHost / followerHost 単列インデックスにそのまま乗る。
	 * COUNT(DISTINCT) と同じく「instance 行が存在しない host」も数えるため意味は同一。
	 */
	function distinctFollowingHosts(column: 'followeeHost' | 'followerHost'): SQL {
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

	function notBlockedHost(column: SQL, blocked: string[]): SQL {
		// 生の JS 配列は drizzle により record へ展開され、ANY/ALL の右辺に必要な配列にならない。
		// sql.param で単一の配列パラメータとして渡す。
		return blocked.length === 0 ? sql`TRUE` : sql`${column} NOT ILIKE ALL(${sql.param(blocked)})`;
	}

	async function countQuery(query: SQL): Promise<number> {
		const result = await core.db.execute<{ count: string | number }>(query);

		return Number.parseInt(String(result.rows[0]?.count ?? 0), 10);
	}

	const { commit, chart } = createChartWithCommit(core, 'federation', {
		async tickMinor() {
			const blocked = meta.blockedHosts.flatMap((x) => [x, `%.${x}`]);

			const [sub, pub, pubsub, subActive, pubActive] = await Promise.all([
				countQuery(sql`
						SELECT COUNT(*) AS "count"
						FROM (${distinctFollowingHosts('followeeHost')}) AS "sub"("host")
						WHERE ${notBlockedHost(sql`"sub"."host"`, blocked)}
							AND "sub"."host" NOT IN (
								SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
							)
					`),
				countQuery(sql`
						SELECT COUNT(*) AS "count"
						FROM (${distinctFollowingHosts('followerHost')}) AS "pub"("host")
						WHERE ${notBlockedHost(sql`"pub"."host"`, blocked)}
							AND "pub"."host" NOT IN (
								SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
							)
					`),
				countQuery(sql`
						SELECT COUNT(*) AS "count"
						FROM (${distinctFollowingHosts('followeeHost')}) AS "pubsub"("host")
						WHERE ${notBlockedHost(sql`"pubsub"."host"`, blocked)}
							AND "pubsub"."host" NOT IN (
								SELECT "instance"."host" FROM "instance" WHERE "instance"."suspensionState" != 'none'
							)
							AND EXISTS (
								SELECT 1 FROM "following" AS "f" WHERE "f"."followerHost" = "pubsub"."host"
							)
					`),
				countQuery(sql`
						SELECT COUNT("instance"."id") AS "count"
						FROM "instance"
						WHERE "instance"."host" IN (
								SELECT "f"."followeeHost" FROM "following" AS "f" WHERE "f"."followeeHost" IS NOT NULL
							)
							AND ${notBlockedHost(sql`"instance"."host"`, blocked)}
							AND "instance"."suspensionState" = 'none'
							AND "instance"."isNotResponding" = false
					`),
				countQuery(sql`
						SELECT COUNT("instance"."id") AS "count"
						FROM "instance"
						WHERE "instance"."host" IN (
								SELECT "f"."followerHost" FROM "following" AS "f" WHERE "f"."followerHost" IS NOT NULL
							)
							AND ${notBlockedHost(sql`"instance"."host"`, blocked)}
							AND "instance"."suspensionState" = 'none'
							AND "instance"."isNotResponding" = false
					`),
			]);

			return {
				sub,
				pub,
				pubsub,
				subActive,
				pubActive,
			};
		},
	});

	return {
		...chart,
		async deliverd(host: string, succeeded: boolean): Promise<void> {
			commit(
				succeeded
					? {
							deliveredInstances: [host],
						}
					: {
							stalled: [host],
						},
			);
		},

		async inbox(host: string): Promise<void> {
			commit({
				inboxInstances: [host],
			});
		},
	};
}

type FederationChartWriter = ReturnType<typeof createFederationChartWriter>;

function createUsersChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'users', {
		async tickMajor() {
			const [localCount, remoteCount] = await Promise.all([
				countUsersByHostFromDatabase(core.db, null),
				countUsersByHostNotNullFromDatabase(core.db),
			]);

			return {
				'local.total': localCount,
				'remote.total': remoteCount,
			};
		},
	});

	return {
		...chart,
		async update(user: { id: MiUser['id']; host: MiUser['host'] }, isAdditional: boolean): Promise<void> {
			const prefix = user.host == null ? 'local' : 'remote';

			commit({
				[`${prefix}.total`]: isAdditional ? 1 : -1,
				[`${prefix}.inc`]: isAdditional ? 1 : 0,
				[`${prefix}.dec`]: isAdditional ? 0 : 1,
			});
		},
	};
}

type UsersChartWriter = ReturnType<typeof createUsersChartWriter>;

function createPerUserFollowingChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'perUserFollowing', {
		async tickMajor(group) {
			if (group == null) return {};
			const [localFollowingsCount, localFollowersCount, remoteFollowingsCount, remoteFollowersCount] =
				await Promise.all([
					countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase(core.db, group, false),
					countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase(core.db, group, false),
					countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase(core.db, group, true),
					countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase(core.db, group, true),
				]);

			return {
				'local.followings.total': localFollowingsCount,
				'local.followers.total': localFollowersCount,
				'remote.followings.total': remoteFollowingsCount,
				'remote.followers.total': remoteFollowersCount,
			};
		},
	});

	return {
		...chart,
		update(
			follower: { id: MiUser['id']; host: MiUser['host'] },
			followee: { id: MiUser['id']; host: MiUser['host'] },
			isFollow: boolean,
		): void {
			const prefixFollower = follower.host == null ? 'local' : 'remote';
			const prefixFollowee = followee.host == null ? 'local' : 'remote';

			commit(
				{
					[`${prefixFollower}.followings.total`]: isFollow ? 1 : -1,
					[`${prefixFollower}.followings.inc`]: isFollow ? 1 : 0,
					[`${prefixFollower}.followings.dec`]: isFollow ? 0 : 1,
				},
				follower.id,
			);
			commit(
				{
					[`${prefixFollowee}.followers.total`]: isFollow ? 1 : -1,
					[`${prefixFollowee}.followers.inc`]: isFollow ? 1 : 0,
					[`${prefixFollowee}.followers.dec`]: isFollow ? 0 : 1,
				},
				followee.id,
			);
		},
	};
}

type PerUserFollowingChartWriter = ReturnType<typeof createPerUserFollowingChartWriter>;

function createApRequestChartWriter(core: ChartCoreDependencies) {
	const { commit, chart } = createChartWithCommit(core, 'apRequest');

	return {
		...chart,
		async deliverSucc(): Promise<void> {
			commit({
				deliverSucceeded: 1,
			});
		},

		async deliverFail(): Promise<void> {
			commit({
				deliverFailed: 1,
			});
		},

		async inbox(): Promise<void> {
			commit({
				inboxReceived: 1,
			});
		},
	};
}

type ApRequestChartWriter = ReturnType<typeof createApRequestChartWriter>;

export type ChartWriters = {
	driveChart: DriveChartWriter;
	perUserDriveChart: PerUserDriveChartWriter;
	instanceChart: InstanceChartWriter;
	notesChart: NotesChartWriter;
	perUserNotesChart: PerUserNotesChartWriter;
	activeUsersChart: ActiveUsersChartWriter;
	perUserReactionsChart: PerUserReactionsChartWriter;
	perUserPvChart: PerUserPvChartWriter;
	federationChart: FederationChartWriter;
	usersChart: UsersChartWriter;
	perUserFollowingChart: PerUserFollowingChartWriter;
	apRequestChart: ApRequestChartWriter;
};

export function createChartWriters(deps: ChartWriterDependencies): ChartWriters {
	const core: ChartCoreDependencies = {
		db: deps.db,
		lock: (key) => acquireChartInsertLock(deps.redis, key),
		logger: deps.logger as Logger,
	};

	return {
		driveChart: createDriveChartWriter(core),
		perUserDriveChart: createPerUserDriveChartWriter(core),
		instanceChart: createInstanceChartWriter(core),
		notesChart: createNotesChartWriter(core),
		perUserNotesChart: createPerUserNotesChartWriter(core),
		activeUsersChart: createActiveUsersChartWriter(core),
		perUserReactionsChart: createPerUserReactionsChartWriter(core),
		perUserPvChart: createPerUserPvChartWriter(core),
		federationChart: createFederationChartWriter(core, deps.meta),
		usersChart: createUsersChartWriter(core),
		perUserFollowingChart: createPerUserFollowingChartWriter(core),
		apRequestChart: createApRequestChartWriter(core),
	};
}

export async function saveChartWriters(writers: ChartWriters): Promise<void> {
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

export function startChartWriterSaveInterval(writers: ChartWriters): NodeJS.Timeout {
	return setInterval(
		() => {
			void saveChartWriters(writers);
		},
		1000 * 60 * 20,
	);
}
