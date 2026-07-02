/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { Config } from '@/config.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { Packed } from '@/misc/json-schema.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { deserializeUser } from '@/core/UserStore.js';
import type { UserRow } from '@/db/schema/user.js';

function defaultActiveThreshold() {
	return new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
}

@Injectable()
export class UserSearchService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
	) {
	}

	/**
	 * ユーザ名とホスト名によるユーザ検索を行う.
	 *
	 * - 検索結果には優先順位がつけられており、以下の順序で検索が行われる.
	 *   1. フォローしているユーザのうち、一定期間以内（※）に更新されたユーザ
	 *   2. フォローしているユーザのうち、一定期間以内に更新されていないユーザ
	 *   3. フォローしていないユーザのうち、一定期間以内に更新されたユーザ
	 *   4. フォローしていないユーザのうち、一定期間以内に更新されていないユーザ
	 * - ログインしていない場合は、以下の順序で検索が行われる.
	 *   1. 一定期間以内に更新されたユーザ
	 *   2. 一定期間以内に更新されていないユーザ
	 * - それぞれの検索結果はユーザ名の昇順でソートされる.
	 * - 動作的には先に登場した検索結果の登場位置が優先される(条件的にユーザIDが重複することはないが).
	 *   （1で既にヒットしていた場合、2, 3, 4でヒットしても無視される）
	 * - ユーザ名とホスト名の検索条件はそれぞれ前方一致で検索される.
	 * - ユーザ名の検索は大文字小文字を区別しない.
	 * - ホスト名の検索は大文字小文字を区別しない.
	 * - 検索結果は最大で {@link opts.limit} 件までとなる.
	 *
	 * ※一定期間とは {@link params.activeThreshold} で指定された日時から現在までの期間を指す.
	 *
	 * @param params 検索条件.
	 * @param opts 関数の動作を制御するオプション.
	 * @param me 検索を実行するユーザの情報. 未ログインの場合は指定しない.
	 * @see {@link UserSearchService#buildSearchUserQueries}
	 * @see {@link UserSearchService#buildSearchUserNoLoginQueries}
	 */
	@bindThis
	public async searchByUsernameAndHost(
		params: {
			username?: string | null,
			host?: string | null,
			activeThreshold?: Date,
		},
		opts?: {
			limit?: number,
			detail?: boolean,
		},
		me?: MiUser | null,
	): Promise<Packed<'User'>[]> {
		const queries = me ? this.buildSearchUserQueries(me, params) : this.buildSearchUserNoLoginQueries(params);

		let resultSet = new Set<MiUser['id']>();
		const limit = opts?.limit ?? 10;
		for (const conditions of queries) {
			const ids = await this.selectSearchUserIds(conditions, limit - resultSet.size);

			resultSet = new Set([...resultSet, ...ids]);
			if (resultSet.size >= limit) {
				break;
			}
		}

		return this.userEntityService.packMany<'UserLite' | 'UserDetailed'>(
			[...resultSet].slice(0, limit),
			me,
			{ schema: opts?.detail ? 'UserDetailed' : 'UserLite' },
		);
	}

	/**
	 * ログイン済みユーザによる検索実行時のクエリ一覧を構築する.
	 * @param me
	 * @param params
	 * @private
	 */
	@bindThis
	private buildSearchUserQueries(
		me: MiUser,
		params: {
			username?: string | null,
			host?: string | null,
			activeThreshold?: Date,
		},
	): SQL[][] {
		// デフォルト30日以内に更新されたユーザーをアクティブユーザーとする
		const activeThreshold = params.activeThreshold ?? defaultActiveThreshold();
		const followingUserQuery = sql`SELECT "followeeId" FROM "following" WHERE "followerId" = ${me.id}`;
		const baseConditions = this.buildBaseUserSearchConditions(params);

		return [
			[
				...baseConditions,
				sql`"user"."id" IN (${followingUserQuery})`,
				sql`"user"."updatedAt" > ${activeThreshold}`,
			],
			[
				...baseConditions,
				sql`"user"."id" IN (${followingUserQuery})`,
				sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" <= ${activeThreshold})`,
			],
			[
				...baseConditions,
				sql`"user"."id" NOT IN (${followingUserQuery})`,
				sql`"user"."updatedAt" > ${activeThreshold}`,
			],
			[
				...baseConditions,
				sql`"user"."id" NOT IN (${followingUserQuery})`,
				sql`"user"."updatedAt" <= ${activeThreshold}`,
			],
		];
	}

	/**
	 * ログインしていないユーザによる検索実行時のクエリ一覧を構築する.
	 * @param params
	 * @private
	 */
	@bindThis
	private buildSearchUserNoLoginQueries(params: {
		username?: string | null,
		host?: string | null,
		activeThreshold?: Date,
	}): SQL[][] {
		// デフォルト30日以内に更新されたユーザーをアクティブユーザーとする
		const activeThreshold = params.activeThreshold ?? defaultActiveThreshold();
		const baseConditions = this.buildBaseUserSearchConditions(params);

		return [
			[
				...baseConditions,
				sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`,
			],
			[
				...baseConditions,
				sql`"user"."updatedAt" <= ${activeThreshold}`,
			],
		];
	}

	/**
	 * ユーザ検索クエリで共通する抽出条件をあらかじめ設定したクエリビルダを生成する.
	 * @param params
	 * @private
	 */
	@bindThis
	private buildBaseUserSearchConditions(params: {
		username?: string | null,
		host?: string | null,
	}): SQL[] {
		const conditions: SQL[] = [];

		if (params.username) {
			conditions.push(sql`"user"."usernameLower" LIKE ${sqlLikeEscape(params.username.toLowerCase()) + '%'}`);
		}

		if (params.host) {
			if (params.host === this.config.hostname || params.host === '.') {
				conditions.push(sql`"user"."host" IS NULL`);
			} else {
				conditions.push(sql`"user"."host" LIKE ${sqlLikeEscape(params.host.toLowerCase()) + '%'}`);
			}
		}

		conditions.push(sql`"user"."isSuspended" = FALSE`);

		return conditions;
	}

	@bindThis
	private async selectSearchUserIds(conditions: SQL[], limit: number): Promise<MiUser['id'][]> {
		if (limit <= 0) return [];

		const result = await this.db.execute<{ id: MiUser['id'] }>(sql`
			SELECT "user"."id" AS "id"
			FROM "user"
			WHERE ${sql.join(conditions, sql` AND `)}
			ORDER BY "user"."usernameLower" ASC
			LIMIT ${limit}
		`);

		return result.rows.map(row => row.id);
	}

	@bindThis
	private limitOffsetSql(options: Partial<{ limit: number; offset: number }>): SQL {
		return sql.join([
			options.limit == null ? sql`` : sql`LIMIT ${options.limit}`,
			options.offset == null ? sql`` : sql`OFFSET ${options.offset}`,
		], sql` `);
	}

	@bindThis
	public async search(query: string, meId: MiUser['id'] | null, options: Partial<{
		limit: number;
		offset: number;
		origin: 'local' | 'remote' | 'combined';
	}> = {}) {
		const activeThreshold = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)); // 30日

		const isUsername = query.startsWith('@') && !query.includes(' ') && query.indexOf('@', 1) === -1;

		const nameConditions: SQL[] = [
			sql`("user"."name" ILIKE ${'%' + sqlLikeEscape(query) + '%'} ${
				isUsername
					? sql`OR "user"."usernameLower" LIKE ${sqlLikeEscape(query.replace('@', '').toLowerCase()) + '%'}`
					: this.userEntityService.validateLocalUsername(query)
						? sql`OR "user"."usernameLower" LIKE ${'%' + sqlLikeEscape(query.toLowerCase()) + '%'}`
						: sql``
			})`,
			sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`,
			sql`"user"."isSuspended" = FALSE`,
		];

		if (meId != null) {
			nameConditions.push(sql`"user"."id" NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
		}

		if (options.origin === 'local') {
			nameConditions.push(sql`"user"."host" IS NULL`);
		} else if (options.origin === 'remote') {
			nameConditions.push(sql`"user"."host" IS NOT NULL`);
		}

		const nameResult = await this.db.execute<UserRow>(sql`
			SELECT "user".*
			FROM "user"
			WHERE ${sql.join(nameConditions, sql` AND `)}
			ORDER BY "user"."updatedAt" DESC NULLS LAST
			${this.limitOffsetSql(options)}
		`);
		let users = nameResult.rows.map(row => deserializeUser(row));

		if (users.length < (options.limit ?? 30)) {
			const profileConditions: SQL[] = [
				sql`"prof"."description" ILIKE ${'%' + sqlLikeEscape(query) + '%'}`,
			];

			if (meId != null) {
				profileConditions.push(sql`"prof"."userId" NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
			}

			if (options.origin === 'local') {
				profileConditions.push(sql`"prof"."userHost" IS NULL`);
			} else if (options.origin === 'remote') {
				profileConditions.push(sql`"prof"."userHost" IS NOT NULL`);
			}

			const profileUserQuery = sql`
				SELECT "prof"."userId"
				FROM "user_profile" AS "prof"
				WHERE ${sql.join(profileConditions, sql` AND `)}
			`;

			const profileResult = await this.db.execute<UserRow>(sql`
				SELECT "user".*
				FROM "user"
				WHERE "user"."id" IN (${profileUserQuery})
					AND ("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})
					AND "user"."isSuspended" = FALSE
				ORDER BY "user"."updatedAt" DESC NULLS LAST
				${this.limitOffsetSql(options)}
			`);

			users = users.concat(profileResult.rows.map(row => deserializeUser(row)));
		}

		return users;
	}
}
